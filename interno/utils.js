// =====================================================
// utils.js — Núcleo compartido de remateTaller (v1.1)
// Toda página (interna y pública) importa desde acá.
// Stack: Firebase v10 modular (ESM por CDN), vanilla JS.
// =====================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  collection, getDocs, query, where, orderBy, limit,
  serverTimestamp, onSnapshot, getCountFromServer
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

// ---------- Administradores iniciales ----------
// En el primer login se les crea automáticamente su doc en `usuarios`.
// Solo estos uid se auto-provisionan; cualquier otro queda afuera.
const ADMINS_INICIALES = {
  "6HnSCkjKGEWKv39f37HJRpLEToV2": "Florencia",
  "R9b8YLM66mdrY8FTC8gEjBNaOr92": "Mauro"
};

// =====================================================
// AUTENTICACIÓN Y CONTROL DE ACCESO (admins)
// =====================================================

/**
 * Verifica sesión + usuario activo en Firestore.
 * Auto-crea el doc de usuario si el uid está en ADMINS_INICIALES.
 * Sin sesión o inactivo → login.html.
 * callback(user, datosUsuario)
 */
export function verificarAuth(callback) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    try {
      const ref = doc(db, "usuarios", user.uid);
      let snap = await getDoc(ref);

      if (!snap.exists() && ADMINS_INICIALES[user.uid]) {
        await setDoc(ref, {
          nombre: ADMINS_INICIALES[user.uid],
          email: user.email || "",
          rol: "admin",
          activo: true,
          creadoEn: serverTimestamp()
        });
        snap = await getDoc(ref);
      }

      if (!snap.exists() || snap.data().activo === false) {
        await signOut(auth);
        window.location.href = "login.html";
        return;
      }
      callback(user, snap.data());
    } catch (e) {
      console.error("Error verificando usuario:", e);
      window.location.href = "login.html";
    }
  });
}

export async function cerrarSesion() {
  await signOut(auth);
  window.location.href = "login.html";
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
  let html = `<div class="brand"><span class="material-icons">gavel</span><span>remateTaller</span></div><nav class="nav-scroll">`;
  NAV_ITEMS.forEach((p) => {
    const cls = p.id === actual ? "nav-link activo" : "nav-link";
    html += `<a href="${p.href}" class="${cls}"><span class="material-icons">${p.icon}</span><span>${p.label}</span></a>`;
  });
  html += `<a href="#" class="nav-link" id="btnSalir"><span class="material-icons">logout</span><span>Salir</span></a></nav>`;
  el.innerHTML = html;
  document.getElementById("btnSalir").addEventListener("click", (e) => {
    e.preventDefault();
    cerrarSesion();
  });
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
  if (!res.ok) throw new Error("Error subiendo la foto (HTTP " + res.status + ")");
  const data = await res.json();
  return data.secure_url;
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
