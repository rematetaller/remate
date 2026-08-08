// =====================================================
// utils.js — Núcleo compartido de remateTaller (v1.6)
// Toda página (interna y pública) importa desde acá.
// Stack: Firebase v10 modular (ESM por CDN), vanilla JS.
//
// v1.6 (tanda 12):
//  · HOJA DE CUENTA detrás del avatar de la topbar: quién sos,
//    "Cerrar sesión" y "Reparar la app". Antes "Salir" era el último
//    ítem de la barra de navegación, que scrollea horizontal: en un
//    teléfono quedaba fuera de pantalla, o sea invisible.
//  · cerrarSesion() ahora LIMPIA la caché local (terminate +
//    clearIndexedDbPersistence). La caché de Firestore es una por
//    navegador: sin esto, quien entra después en ese teléfono hereda
//    los datos del anterior.
//  · repararApp(): borra service workers, cachés y bases locales.
//    Sin tocar nada del servidor. Dentro de una PWA instalada no hay
//    consola para hacerlo a mano.
//  · Se retiró la autoprovisión de administradores: las reglas v0.4
//    la deniegan a propósito (si el cliente puede crear su propia
//    ficha en `usuarios`, se puede poner rol de admin solo). Ahora,
//    en lugar de rebotar a login.html sin explicación, se muestra un
//    mensaje que dice qué pasó.
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, getCountFromServer,
  terminate, clearIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ---------- Configuración Firebase (pública por diseño) ----------
const firebaseConfig = {
  apiKey: "AIzaSyB2ZT8nLzhcejyqdOA1Ipuwaipm3KTAaRU",
  authDomain: "remate-acbc9.firebaseapp.com",
  projectId: "remate-acbc9",
  storageBucket: "remate-acbc9.firebasestorage.app",
  messagingSenderId: "815214584678",
  appId: "1:815214584678:web:3fd234a6e92eed932e5ea7"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Re-export de helpers de Firestore para las páginas.
export {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, getCountFromServer,
  signInWithEmailAndPassword
};

// ---------- Cloudinary (cuenta propia de remateTaller) ----------
// Solo cloud name + preset unsigned. El api_secret NUNCA va en el cliente.
export const CLOUDINARY = {
  cloud: "r9u5oous",
  preset: "preset-remate" // unsigned preset — crearlo en Cloudinary si no existe
};

// =====================================================
// AUTENTICACIÓN Y CONTROL DE ACCESO (admins)
// =====================================================

// Quién está usando el panel. Lo llena verificarAuth y lo leen la
// navegación y la hoja de cuenta. Las páginas lo piden con usuario().
let _usuario = null;

/** { uid, email, nombre, rol, activo } o null si no hay sesión verificada. */
export function usuario() { return _usuario; }

/**
 * Verifica sesión + usuario activo en Firestore.
 * Sin sesión → login.html.
 * Con sesión pero sin ficha activa → cartel explicando por qué (antes
 * rebotaba a login.html en silencio y parecía un error de contraseña).
 * callback(user, datosUsuario)
 */
export function verificarAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    try {
      const snap = await getDoc(doc(db, "usuarios", user.uid));

      if (!snap.exists()) {
        mostrarSinAcceso(
          "Tu cuenta existe, pero todavía no está habilitada en el sistema.",
          "Pedile a un administrador que te dé de alta desde Configuración " +
          "con este identificador:",
          user.uid
        );
        return;
      }
      if (snap.data().activo === false) {
        mostrarSinAcceso(
          "Tu cuenta está desactivada.",
          "Un administrador puede reactivarla desde Configuración.",
          ""
        );
        return;
      }

      _usuario = Object.assign(
        { uid: user.uid, email: user.email || "" },
        snap.data()
      );
      callback(user, snap.data());
    } catch (e) {
      console.error("Error verificando usuario:", e);
      mostrarSinAcceso(
        "No pudimos verificar tu cuenta.",
        "Puede ser un problema de conexión, o de permisos en la base. " +
        "El detalle está en la consola del navegador.",
        (e && e.code) ? e.code : ""
      );
    }
  });
}

/** Pantalla completa que explica por qué no se puede entrar. */
function mostrarSinAcceso(titulo, detalle, dato) {
  asegurarEstilosCuenta();
  const d = document.createElement("div");
  d.className = "rt-bloqueo";
  d.innerHTML =
    '<div class="rt-bloqueo-caja">' +
      '<span class="material-icons rt-bloqueo-ico">lock_person</span>' +
      "<h2>" + escapar(titulo) + "</h2>" +
      "<p>" + escapar(detalle) + "</p>" +
      (dato ? '<code class="rt-dato">' + escapar(dato) + "</code>" : "") +
      '<button class="rt-btn-salir" id="rtVolverLogin">Volver a entrar</button>' +
    "</div>";
  document.body.appendChild(d);
  document.getElementById("rtVolverLogin")
    .addEventListener("click", () => cerrarSesion(false));
}

/**
 * Cierra sesión y BORRA la caché local de Firestore.
 * La caché es una por navegador: si no se limpia, la próxima persona que
 * entre en este teléfono abre el panel con los datos de la anterior.
 * El Promise.race es para que un IndexedDB trancado no deje a nadie
 * encerrado adentro: a los 3 segundos se sale igual.
 */
export async function cerrarSesion(confirmar = true) {
  if (confirmar && !window.confirm("¿Cerrar sesión en este dispositivo?")) return;
  try { await signOut(auth); } catch (e) { console.warn("signOut:", e); }
  try {
    await Promise.race([
      (async () => { await terminate(db); await clearIndexedDbPersistence(db); })(),
      new Promise((r) => setTimeout(r, 3000))
    ]);
  } catch (e) { console.warn("limpieza de caché local:", e); }
  window.location.replace("login.html");
}

/**
 * SALIDA DE EMERGENCIA — "Reparar la app".
 * El panel se instala como PWA en el teléfono, y ahí no hay consola ni
 * forma cómoda de borrar los datos del sitio. Cuando algo del lado del
 * navegador queda trancado (un service worker viejo sirviendo mezcla,
 * una base local a medio cerrar, una sesión que rebota), esto hace la
 * limpieza desde un botón.
 * Borra: service workers, todas las cachés y las bases locales de
 * Firebase. NO toca el servidor: ni un producto, ni una venta, ni un
 * usuario.
 */
export async function repararApp() {
  if (!window.confirm(
    "Reparar borra lo que la app guardó en ESTE teléfono (cachés y sesión) " +
    "y te va a pedir entrar de nuevo.\n\n" +
    "No se toca nada del servidor: ni datos, ni fotos, ni usuarios.\n\n¿Seguimos?"
  )) return;
  try { await signOut(auth); } catch (e) { console.warn("signOut:", e); }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { console.warn("service workers:", e); }
  try {
    if (window.caches) {
      const claves = await caches.keys();
      await Promise.all(claves.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn("cachés:", e); }
  try {
    await Promise.race([
      (async () => { await terminate(db); await clearIndexedDbPersistence(db); })(),
      new Promise((r) => setTimeout(r, 3000))
    ]);
  } catch (e) { console.warn("bases locales:", e); }
  window.location.replace("login.html");
}

// =====================================================
// LLAVES DE ACCESO (compradores) — usado por páginas públicas
// =====================================================

/**
 * Valida una llave contra la base.
 * Devuelve { ok, motivo, datos }:
 *   ok=true  → llave vigente
 *   motivo: 'sin-codigo' | 'inexistente' | 'revocada' | 'vencida'
 */
export async function validarLlave(codigo) {
  if (!codigo) return { ok: false, motivo: "sin-codigo" };
  try {
    const snap = await getDoc(doc(db, "llaves", String(codigo).trim().toUpperCase()));
    if (!snap.exists()) return { ok: false, motivo: "inexistente" };
    const d = snap.data();
    if (d.revocada) return { ok: false, motivo: "revocada", datos: d };
    const vence = tsAms(d.venceEn);
    if (!vence || Date.now() > vence) return { ok: false, motivo: "vencida", datos: d };
    return { ok: true, datos: d };
  } catch (e) {
    console.error("Error validando llave:", e);
    return { ok: false, motivo: "error" };
  }
}

/** Lee la configuración pública (textos, WhatsApp de contacto). */
export async function leerConfigPublico() {
  try {
    const snap = await getDoc(doc(db, "config", "publico"));
    return snap.exists() ? snap.data() : {};
  } catch (e) {
    return {};
  }
}

/** Convierte Timestamp | Date | ms → ms (o 0). */
export function tsAms(v) {
  if (!v) return 0;
  if (v.toDate) return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  return Number(v) || 0;
}

// =====================================================
// NAVEGACIÓN INTERNA (mobile-first)
// =====================================================

const NAV_ITEMS = [
  { id: "panel",         label: "Inicio",     icon: "home",          href: "panel.html" },
  { id: "inventario",    label: "Inventario", icon: "inventory_2",   href: "inventario.html" },
  { id: "llaves",        label: "Llaves",     icon: "vpn_key",       href: "llaves.html" },
  { id: "pedidos",       label: "Pedidos",    icon: "shopping_cart", href: "pedidos.html" },
  { id: "ventas",        label: "Ventas",     icon: "receipt_long",  href: "ventas.html" },
  { id: "configuracion", label: "Config.",    icon: "settings",      href: "configuracion.html" }
];

export function renderNav(actual) {
  const el = document.getElementById("topbar");
  if (!el) return;
  const nombre = (_usuario && _usuario.nombre) || "";
  let html =
    '<div class="rt-topfila">' +
      '<div class="brand"><span class="material-icons">gavel</span><span>remateTaller</span></div>' +
      '<button class="rt-avatar" id="rtBtnCuenta" aria-label="Mi cuenta" title="' +
        escapar(nombre) + '">' + escapar(inicialesDe(nombre)) + "</button>" +
    "</div>" +
    '<nav class="nav-scroll">';
  NAV_ITEMS.forEach((p) => {
    const cls = p.id === actual ? "nav-link activo" : "nav-link";
    html += '<a href="' + p.href + '" class="' + cls + '"><span class="material-icons">' +
      p.icon + "</span><span>" + p.label + "</span></a>";
  });
  html += "</nav>";
  el.innerHTML = html;
  // "Salir" ya no vive acá: vivía al final de una barra que scrollea, o sea
  // fuera de pantalla en un teléfono. Ahora está en la hoja de cuenta.
  document.getElementById("rtBtnCuenta")
    .addEventListener("click", mostrarCuenta);
}

/** Iniciales para el avatar: "Florencia" → "F", "Ana María" → "AM". */
function inicialesDe(nombre) {
  const partes = String(nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes[1] ? partes[1][0] : "")).toUpperCase();
}

// =====================================================
// HOJA DE CUENTA — quién sos, salir, reparar
// =====================================================

const CSS_CUENTA = `
.rt-topfila { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.rt-avatar { flex:0 0 auto; width:36px; height:36px; border-radius:50%; border:none;
  background:var(--c-primario, #b45309); color:var(--c-primario-claro, #fef3e2);
  font-size:14px; font-weight:600; letter-spacing:.5px; cursor:pointer;
  display:flex; align-items:center; justify-content:center; }
#rtCuenta { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5);
  z-index:550; align-items:flex-end; justify-content:center; }
#rtCuenta .rt-caja { background:var(--c-superficie, #fff); width:100%; max-width:540px;
  border-radius:16px 16px 0 0; padding:14px 18px 26px; }
#rtCuenta .rt-quien { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
#rtCuenta .rt-quien .rt-avatar { width:44px; height:44px; font-size:17px; cursor:default; }
#rtCuenta .rt-nombre { font-weight:600; }
#rtCuenta .rt-mail { font-size:13px; color:var(--c-texto-suave, #666);
  word-break:break-all; }
#rtCuenta button.rt-fila { display:flex; align-items:center; gap:10px; width:100%;
  border:none; background:none; padding:14px 4px; font-size:15px; cursor:pointer;
  text-align:left; border-top:1px solid var(--c-borde, #ddd); color:inherit; }
#rtCuenta .rt-nota { font-size:12px; color:var(--c-texto-suave, #666); margin:2px 0 0 34px; }
.rt-bloqueo { position:fixed; inset:0; background:var(--c-fondo, #f4f4f2); z-index:700;
  display:flex; align-items:center; justify-content:center; padding:24px; }
.rt-bloqueo-caja { max-width:420px; text-align:center; }
.rt-bloqueo-ico { font-size:44px; color:var(--c-primario, #b45309); }
.rt-bloqueo h2 { font-size:18px; margin:10px 0 6px; }
.rt-bloqueo p { font-size:14px; line-height:1.5; color:var(--c-texto-suave, #666); }
.rt-dato { display:block; margin:10px 0; font-size:12px; word-break:break-all;
  background:var(--c-superficie, #fff); padding:8px; border-radius:8px; }
.rt-btn-salir { margin-top:14px; border:none; border-radius:10px; padding:11px 18px;
  background:var(--c-primario, #b45309); color:#fff; font-size:15px; cursor:pointer; }
`;

function asegurarEstilosCuenta() {
  if (document.getElementById("rtCssCuenta")) return;
  const st = document.createElement("style");
  st.id = "rtCssCuenta";
  st.textContent = CSS_CUENTA;
  document.head.appendChild(st);
}

function asegurarHojaCuenta() {
  asegurarEstilosCuenta();
  if (document.getElementById("rtCuenta")) return;
  const m = document.createElement("div");
  m.id = "rtCuenta";
  m.innerHTML =
    '<div class="rt-caja">' +
      '<div class="rt-quien">' +
        '<span class="rt-avatar" id="rtCuentaIni"></span>' +
        '<div><div class="rt-nombre" id="rtCuentaNombre"></div>' +
        '<div class="rt-mail" id="rtCuentaMail"></div></div>' +
      "</div>" +
      '<button class="rt-fila" id="rtFilaReparar">' +
        '<span class="material-icons">healing</span>Reparar la app</button>' +
      '<div class="rt-nota">Borra cachés y sesión de este teléfono. No toca los datos.</div>' +
      '<button class="rt-fila" id="rtFilaSalir">' +
        '<span class="material-icons">logout</span>Cerrar sesión</button>' +
    "</div>";
  document.body.appendChild(m);
  m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; });
  document.getElementById("rtFilaSalir")
    .addEventListener("click", () => cerrarSesion(true));
  document.getElementById("rtFilaReparar")
    .addEventListener("click", repararApp);
}

export function mostrarCuenta() {
  asegurarHojaCuenta();
  const nombre = (_usuario && _usuario.nombre) || "";
  document.getElementById("rtCuentaIni").textContent = inicialesDe(nombre);
  document.getElementById("rtCuentaNombre").textContent = nombre || "Sin nombre";
  document.getElementById("rtCuentaMail").textContent =
    (_usuario && _usuario.email) || "";
  document.getElementById("rtCuenta").style.display = "flex";
}

// =====================================================
// FOTOS: compresión client-side + subida a Cloudinary
// (lado mayor 2000px, JPEG 0.85 — patrón Casa Verde)
// =====================================================

export function comprimirImagen(file, maxLado = 2000, calidad = 0.85) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const mayor = Math.max(w, h);
      if (mayor > maxLado) {
        const f = maxLado / mayor;
        w = Math.round(w * f);
        h = Math.round(h * f);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => resolve(blob && blob.size < file.size ? blob : file),
        "image/jpeg",
        calidad
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // a prueba de fallos: sube el original
    };
    img.src = url;
  });
}

// maxLado: lado mayor máximo en px (default 2000; el inventario de
// productos usa 800, como las facturas de gastos de CasaVerde).
export async function subirFoto(file, carpeta, maxLado = 2000) {
  const blob = await comprimirImagen(file, maxLado);
  const fd = new FormData();
  fd.append("file", blob);
  fd.append("upload_preset", CLOUDINARY.preset);
  if (carpeta) fd.append("folder", "remate/" + carpeta);
  const res = await fetch(
    "https://api.cloudinary.com/v1_1/" + CLOUDINARY.cloud + "/image/upload",
    { method: "POST", body: fd }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Cloudinary devuelve la causa en data.error.message
    // (ej: "Upload preset not found" → falta crear el preset unsigned).
    const detalle = (data && data.error && data.error.message)
      ? data.error.message
      : "HTTP " + res.status;
    throw new Error("Cloudinary: " + detalle);
  }
  return data.secure_url;
}

// =====================================================
// VISOR DE FOTOS — pantalla completa, con navegación
// mostrarFoto(urls, indice): urls puede ser un array o una sola url.
// =====================================================

const VISOR_CSS = `
#visorFoto { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.92);
  z-index:600; align-items:center; justify-content:center; }
#visorFoto img { max-width:96vw; max-height:88vh; object-fit:contain; border-radius:4px; }
#visorFoto button { position:absolute; background:rgba(255,255,255,0.18); color:#fff;
  border:none; border-radius:50%; width:44px; height:44px; font-size:28px;
  display:flex; align-items:center; justify-content:center; cursor:pointer; }
#visorCerrar { top:14px; right:14px; }
#visorPrev { left:8px; top:50%; transform:translateY(-50%); }
#visorNext { right:8px; top:50%; transform:translateY(-50%); }
#visorContador { position:absolute; top:26px; left:16px; color:#fff; font-size:14px; }
`;

let visorUrls = [];
let visorIdx = 0;

function asegurarVisorFoto() {
  if (document.getElementById("visorFoto")) return;
  const st = document.createElement("style");
  st.textContent = VISOR_CSS;
  document.head.appendChild(st);
  const v = document.createElement("div");
  v.id = "visorFoto";
  v.innerHTML = `
    <img id="visorImg" alt="Foto ampliada">
    <button id="visorCerrar" class="material-icons" aria-label="Cerrar">close</button>
    <button id="visorPrev" class="material-icons" aria-label="Anterior">chevron_left</button>
    <button id="visorNext" class="material-icons" aria-label="Siguiente">chevron_right</button>
    <span id="visorContador"></span>`;
  document.body.appendChild(v);
  const cerrar = () => { v.style.display = "none"; };
  v.addEventListener("click", (e) => { if (e.target === v) cerrar(); });
  v.querySelector("#visorCerrar").addEventListener("click", cerrar);
  v.querySelector("#visorPrev").addEventListener("click", (e) => {
    e.stopPropagation();
    visorIdx = (visorIdx - 1 + visorUrls.length) % visorUrls.length;
    visorRender();
  });
  v.querySelector("#visorNext").addEventListener("click", (e) => {
    e.stopPropagation();
    visorIdx = (visorIdx + 1) % visorUrls.length;
    visorRender();
  });
}

function visorRender() {
  const v = document.getElementById("visorFoto");
  v.querySelector("#visorImg").src = visorUrls[visorIdx] || "";
  const varias = visorUrls.length > 1;
  v.querySelector("#visorContador").textContent =
    varias ? (visorIdx + 1) + " / " + visorUrls.length : "";
  v.querySelector("#visorPrev").style.display = varias ? "flex" : "none";
  v.querySelector("#visorNext").style.display = varias ? "flex" : "none";
}

export function mostrarFoto(fotos, indice = 0) {
  visorUrls = (Array.isArray(fotos) ? fotos : [fotos]).filter(Boolean);
  if (visorUrls.length === 0) return;
  visorIdx = Math.min(Math.max(0, indice), visorUrls.length - 1);
  asegurarVisorFoto();
  visorRender();
  document.getElementById("visorFoto").style.display = "flex";
}

// =====================================================
// AYUDA CONTEXTUAL — botón "?" junto al título de la página
// Cada página llama iniciarAyuda(titulo, htmlDeAyuda).
// =====================================================

const AYUDA_CSS = `
#modalAyuda { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5);
  z-index:500; align-items:flex-end; justify-content:center; }
#modalAyuda .ayuda-caja { background:var(--c-superficie, #fff); width:100%; max-width:540px;
  max-height:85vh; overflow-y:auto; border-radius:16px 16px 0 0; padding:14px 18px 28px; }
#modalAyuda .ayuda-top { display:flex; justify-content:space-between; align-items:center;
  border-bottom:1px solid var(--c-borde, #ddd); padding-bottom:8px; margin-bottom:4px; }
#modalAyuda .ayuda-top button { border:none; background:none; padding:4px; font-size:24px; cursor:pointer; }
#modalAyuda h3 { margin:16px 0 4px; font-size:15px; }
#modalAyuda p, #modalAyuda li { font-size:14px; line-height:1.5; margin:6px 0; }
#modalAyuda ul { padding-left:18px; margin:4px 0; }
.icono-ayuda { font-size:22px; color:var(--c-primario, #1a73e8); vertical-align:middle;
  margin-left:8px; cursor:pointer; }
`;

function asegurarModalAyuda() {
  if (document.getElementById("modalAyuda")) return;
  const st = document.createElement("style");
  st.textContent = AYUDA_CSS;
  document.head.appendChild(st);
  const m = document.createElement("div");
  m.id = "modalAyuda";
  m.innerHTML = `<div class="ayuda-caja">
    <div class="ayuda-top"><strong id="ayudaTitulo"></strong>
      <button id="ayudaCerrar" class="material-icons" aria-label="Cerrar">close</button></div>
    <div id="ayudaCuerpo"></div>
  </div>`;
  document.body.appendChild(m);
  m.addEventListener("click", (e) => { if (e.target === m) m.style.display = "none"; });
  m.querySelector("#ayudaCerrar").addEventListener("click", () => { m.style.display = "none"; });
}

export function mostrarAyuda(titulo, html) {
  asegurarModalAyuda();
  const m = document.getElementById("modalAyuda");
  m.querySelector("#ayudaTitulo").textContent = titulo;
  m.querySelector("#ayudaCuerpo").innerHTML = html;
  m.style.display = "flex";
}

/** Agrega el ícono "?" al h1 de la página, que abre la ayuda contextual. */
export function iniciarAyuda(titulo, html) {
  const h1 = document.querySelector("main h1");
  if (!h1 || h1.querySelector(".icono-ayuda")) return;
  const b = document.createElement("span");
  b.className = "material-icons icono-ayuda";
  b.textContent = "help_outline";
  b.setAttribute("role", "button");
  b.addEventListener("click", () => mostrarAyuda(titulo, html));
  h1.appendChild(b);
}

// =====================================================
// HELPERS GENERALES
// =====================================================

export function fmtMoneda(monto, moneda) {
  const n = Number(monto || 0).toLocaleString("es-UY", { maximumFractionDigits: 2 });
  return (moneda === "USD" ? "US$ " : "$ ") + n;
}

export function fmtFecha(f) {
  const ms = tsAms(f);
  return ms ? new Date(ms).toLocaleDateString("es-UY") : "—";
}

/** Escapa texto para meterlo en innerHTML sin romper nada. */
export function escapar(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Código de llave legible: 8 caracteres sin ambiguos (0/O, 1/I/L) */
export function generarCodigoLlave() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

/** URL base del sitio público (quita /interno/... si corresponde). */
export function urlBasePublica() {
  const href = window.location.href;
  if (href.indexOf("/interno/") !== -1) return href.split("/interno/")[0];
  return window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, "");
}

/** Solo dígitos de un teléfono (para links wa.me). */
export function soloDigitos(t) {
  return String(t || "").replace(/\D/g, "");
}

export function toast(mensaje, tipo = "ok") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = mensaje;
  t.className = "toast " + tipo + " visible";
  setTimeout(() => t.classList.remove("visible"), 3500);
}
