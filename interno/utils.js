// =====================================================
// utils.js — Núcleo compartido de remateTaller (v1.12)
// Toda página (interna y pública) importa desde acá.
// Stack: Firebase v10 modular (ESM por CDN), vanilla JS.
//
// ── EL REGISTRO NO VIVE ACÁ ──────────────────────────────────
// El registro de tandas es el LIBRO 2 de REMATETALLER-DOCUMENTACION.md,
// y es la autoridad. Lo de abajo es contexto del archivo: qué cambió y
// por qué, para quien lo está leyendo.
// Entre agosto y septiembre de 2026 esto hizo de registro paralelo —el
// Libro 2 quedó parado en la tanda 12 y acá siguieron las 13 a la 19—,
// y mientras tanto el inventario derivó y las reglas quedaron dos
// versiones atrás sin que nada avisara. Si volvés a anotar un cambio
// acá, anotalo también allá, en la misma tanda.
//
// v1.12 (tanda 24):
//  · Teléfonos: `telVisible()` y `urlWhatsapp()`. Un teléfono se GUARDA y se
//    MUESTRA con el «+» del código de país, y el formato pelado que pide
//    wa.me se arma en el momento de usarlo, en un solo lugar. Antes se
//    guardaba sin «+» porque así lo quiere wa.me: dejar que el formato de
//    un tercero decida cómo se le habla a una persona. Las dos toleran lo
//    que ya está guardado, con «+» o sin él.
//  · `avisoDeTelefono()`: las tres cosas que no pueden ser en un número
//    internacional. La que pasa de verdad es el 0 inicial uruguayo, que
//    hace que wa.me devuelva una página de error en vez del chat, sin que
//    desde el panel se note.
//
// v1.11 (tanda 19):
//  · La tolerancia de la búsqueda difusa ahora ESCALA CON EL LARGO. Era
//    2 fija: en un chasis de 17 caracteres eso es un match muy bueno, en
//    un padrón de 4 significa que la mitad del número es distinta. Con
//    eso, buscar "1423" devolvía el padrón "1.622" como coincidencia.
//
// v1.10 (tanda 17):
//  · `esSinDato()`: reconoce los "X", "S/N", "-" con que las libretas
//    viejas dicen que un número NO EXISTE. Antes se guardaban como si
//    fueran el número, y dos libretas sin chasis compartían el mismo id.
//  · La coincidencia parcial arranca en 3 caracteres, no en 4: buscar
//    "KMQ" tiene que encontrar la matrícula "KMQ 607".
//
// v1.9 (tanda 16):
//  · `seccionesDisponibles()`: la lista de secciones que esta persona
//    puede abrir, sacada del MISMO NAV_ITEMS que pinta la barra. El panel
//    la usa para sus accesos directos: una sola fuente, así no hay dos
//    listas que se desincronicen.
//
// v1.8.1 — CORRECCIÓN: renderNav armaba la fila del avatar pero no
//   inyectaba su CSS (solo lo hacía `mostrarCuenta`, o sea recién DESPUÉS
//   de tocarlo). Resultado: un botón sin estilo, cuadrado, apilado debajo
//   de la marca. Los estilos de un componente se inyectan cuando se
//   PINTA, no cuando se usa.
//
// v1.8 (tanda 15):
//  · Permiso `documentos` y su ítem de navegación.
//  · Búsqueda por aproximación de identificadores (motor, chasis,
//    matrícula): canonizar(), plegar() y buscarIdentificador(). Viven
//    en el núcleo porque los van a usar dos pantallas: documentos.html
//    y, cuando exista, el cruce contra las motos del inventario.
//
// v1.7 (tanda 13):
//  · PERMISOS: catálogo único, `puede()`, `esAdmin()`, presets de alta y
//    navegación filtrada. El catálogo vive acá y solo acá: lo leen la
//    navegación, el editor de usuarios y las reglas de Firestore, que son
//    las que de verdad los aplican.
//  · crearCuentaAuth(): crea la cuenta de Auth desde el panel con una
//    instancia secundaria de Firebase, para no perder la sesión propia.
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

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
  createUserWithEmailAndPassword
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

/** { uid, email, nombre, rol, activo, permisos } o null si no hay sesión. */
export function usuario() { return _usuario; }

// ---------- PERMISOS ----------
// FUENTE ÚNICA del catálogo. Lo usan la navegación, el editor de usuarios
// y las reglas de Firestore. Un permiso que no está acá no existe — y si
// está acá pero no está en las reglas, es decoración: la interfaz esconde
// botones, el servidor es el que dice no.
export const PERMISOS = [
  {
    id: "inventario", label: "Inventario", icono: "inventory_2",
    detalle: "Cargar y editar artículos con fotos, categorías y stock. " +
      "SIN tocar precios ni moneda."
  },
  {
    id: "cobros", label: "Registrar cobros", icono: "payments",
    detalle: "Anotar pagos de una venta. Necesita ver la venta."
  },
  {
    id: "entregas", label: "Entregas", icono: "local_shipping",
    detalle: "Mover el estado de entrega: preparada y entregada."
  },
  {
    id: "llaves", label: "Llaves de compradores", icono: "vpn_key",
    detalle: "Crear y revocar llaves. Es el trato con el cliente."
  },
  {
    id: "documentos", label: "Documentación", icono: "description",
    detalle: "Cargar y buscar libretas de propiedad: motor, chasis, matrícula. " +
      "Datos de terceros: no es público."
  },
  {
    id: "validar", label: "Precios y validación", icono: "price_check",
    detalle: "Poner precios, tasar lo pendiente y pasar un pedido a venta. " +
      "Es el acuerdo económico."
  }
];

// Combinaciones típicas, para que dar de alta sea un toque y no cinco.
export const PRESETS = [
  { id: "ayudante", label: "Ayudante", permisos: ["inventario", "cobros", "entregas"] },
  { id: "gestion",  label: "Gestión",  permisos: ["inventario", "cobros", "entregas", "llaves", "validar", "documentos"] }
];

/** El rol 'admin' puede todo, y además usuarios, textos públicos y borrados. */
export function esAdmin() {
  return !!_usuario && _usuario.rol === "admin";
}

/** ¿Tiene este permiso? Acepta un id o un array de ids (alguno alcanza). */
export function puede(permiso) {
  if (!_usuario) return false;
  if (esAdmin()) return true;
  const p = _usuario.permisos || {};
  if (Array.isArray(permiso)) return permiso.some((x) => p[x] === true);
  return p[permiso] === true;
}

/**
 * Crea la cuenta en Auth desde el panel, con una instancia secundaria de
 * Firebase: con la instancia principal, crear un usuario te deja logueado
 * como él y te tira de tu propia sesión. Devuelve el uid.
 * NO crea la ficha en `usuarios` — eso lo hace la página, que es la que
 * sabe el nombre y los permisos.
 */
export async function crearCuentaAuth(email, clave) {
  const app2 = getApps().find((a) => a.name === "alta-usuarios")
    || initializeApp(firebaseConfig, "alta-usuarios");
  const auth2 = getAuth(app2);
  const cred = await createUserWithEmailAndPassword(auth2, email, clave);
  const uid = cred.user.uid;
  await signOut(auth2);
  return uid;
}

/**
 * Contraseña inicial al azar. Nadie la memoriza ni la comparte: la persona
 * entra por "Recuperar contraseña" en login.html. Existe solo porque Auth
 * exige una para crear la cuenta.
 */
export function generarClave() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let c = "";
  for (let i = 0; i < 12; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

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

// `permiso: null` → visible para cualquiera activo.
// `permiso: 'x'` o `[...]` → pide ese permiso, o alguno de la lista.
// `soloAdmin: true` → solo el rol admin.
const NAV_ITEMS = [
  { id: "panel",         label: "Inicio",     icon: "home",          href: "panel.html",         permiso: null },
  { id: "inventario",    label: "Inventario", icon: "inventory_2",   href: "inventario.html",    permiso: ["inventario", "validar"] },
  { id: "llaves",        label: "Llaves",     icon: "vpn_key",       href: "llaves.html",        permiso: "llaves" },
  { id: "pedidos",       label: "Pedidos",    icon: "shopping_cart", href: "pedidos.html",       permiso: "validar" },
  { id: "ventas",        label: "Ventas",     icon: "receipt_long",  href: "ventas.html",        permiso: ["cobros", "entregas", "validar"] },
  { id: "documentos",    label: "Documentos", icon: "description",   href: "documentos.html",    permiso: "documentos" },
  { id: "configuracion", label: "Config.",    icon: "settings",      href: "configuracion.html", soloAdmin: true }
];

export function renderNav(actual) {
  const el = document.getElementById("topbar");
  if (!el) return;
  asegurarEstilosCuenta();
  const nombre = (_usuario && _usuario.nombre) || "";
  let html =
    '<div class="rt-topfila">' +
      '<div class="brand"><span class="material-icons">gavel</span><span>remateTaller</span></div>' +
      '<button class="rt-avatar" id="rtBtnCuenta" aria-label="Mi cuenta" title="' +
        escapar(nombre) + '">' + escapar(inicialesDe(nombre)) + "</button>" +
    "</div>" +
    '<nav class="nav-scroll">';
  NAV_ITEMS.filter(visibleParaMi).forEach((p) => {
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

/**
 * Las secciones que esta persona puede abrir, sin "Inicio". Sale del
 * mismo NAV_ITEMS que la barra: si mañana entra una sección nueva, entra
 * en los dos lugares a la vez (§1.1).
 */
export function seccionesDisponibles() {
  return NAV_ITEMS.filter((i) => i.id !== "panel").filter(visibleParaMi);
}

function visibleParaMi(item) {
  if (item.soloAdmin) return esAdmin();
  if (!item.permiso) return true;
  return puede(item.permiso);
}

/**
 * Corta el paso en una página que la persona no tiene habilitada. La
 * navegación ya la esconde, pero se puede llegar por una URL escrita a
 * mano o por un enlace viejo. Devuelve false si no puede: la página corta
 * ahí y no sigue cargando.
 */
export function exigirPermiso(permiso) {
  if (permiso === "admin" ? esAdmin() : puede(permiso)) return true;
  mostrarSinAcceso(
    "Esta sección no está habilitada para tu cuenta.",
    "Si la necesitás para trabajar, pedile a un administrador que te la habilite.",
    ""
  );
  return false;
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
.rt-topfila { display:flex; align-items:center; justify-content:space-between; gap:8px;
  padding-right:16px; }
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
// IDENTIFICADORES — búsqueda por aproximación
// Motor, chasis y matrícula se guardan TAL COMO ESTÁN EN EL PAPEL: la
// libreta es la evidencia y sacarle los espacios al guardar es perder
// fidelidad. La normalización se hace acá, en memoria, al buscar.
// Con menos de 200 registros esto es instantáneo.
// =====================================================

/**
 * Marcas de "este número no existe". Las libretas viejas de motos —de los
 * 50 y 60, cuando no se numeraba el chasis— traen una X, un guión o S/N en
 * el renglón. Eso NO es un identificador: si se guarda como si lo fuera,
 * dos libretas distintas comparten el mismo valor, chocan en el id y una
 * pisa a la otra. Pasó con dos Lambretta y una Rabeneick.
 */
const SIN_DATO = ["", "X", "XX", "XXX", "SN", "SIN", "SINNUMERO", "NA", "NO",
                  "0", "00", "000", "NINGUNO", "S0", "S0N"];

export function esSinDato(v) {
  const c = canonizar(v);
  return c.length < 3 || SIN_DATO.indexOf(c) !== -1;
}

/** Forma comparable: mayúsculas, sin espacios, guiones ni puntos. */
export function canonizar(v) {
  return String(v == null ? "" : v).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Pliega los caracteres que el ojo y el OCR intercambian, para que
 * "L1PGHKK2XC0810010" y "LIPGHKK2XCO81OO1O" caigan en la misma forma.
 * Dato útil: el estándar de chasis NO usa I, O ni Q — si aparecen, casi
 * siempre son 1 y 0 mal leídos. Casi: las motos importadas baratas no
 * siempre respetan el estándar, así que esto es una pista, no una ley.
 */
export function plegar(v) {
  return canonizar(v)
    .replace(/[IO]/g, (c) => (c === "I" ? "1" : "0"))
    .replace(/Q/g, "0").replace(/S/g, "5").replace(/B/g, "8")
    .replace(/G/g, "6").replace(/Z/g, "2");
}

/** Distancia de edición, cortada en `tope` para no perder tiempo. */
export function distancia(a, b, tope = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > tope) return tope + 1;
  let fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let ant = fila[0];
    fila[0] = i;
    let mejor = fila[0];
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = a[i - 1] === b[j - 1]
        ? ant
        : 1 + Math.min(ant, fila[j], fila[j - 1]);
      ant = tmp;
      if (fila[j] < mejor) mejor = fila[j];
    }
    if (mejor > tope) return tope + 1;
  }
  return fila[b.length];
}

/**
 * Busca `texto` contra una lista de candidatos y devuelve los que
 * coinciden, ordenados de más fuerte a más débil.
 *
 * candidatos: [{ valor, campo, ref }] — `valor` como está en el papel,
 * `campo` para poder decir DÓNDE coincidió, `ref` lo que quiera el que
 * llama (el documento entero, normalmente).
 *
 * Devuelve [{ ...candidato, tipo, canon }] con tipo:
 *   'exacta'   — igual, ignorando espacios y guiones
 *   'confusion'— igual plegando O/0, I/1, S/5, B/8, G/6, Z/2
 *   'cola'     — el buscado está contenido, desde 3 caracteres (leer los
 *                últimos dígitos de una chapa sucia, o las tres letras de
 *                una matrícula, son los casos más comunes de todos)
 *   'cerca'    — a uno o dos caracteres de distancia, y SOLO si el número
 *                es largo: la tolerancia escala con el largo (ver
 *                `toleranciaPara`). Un identificador corto no admite
 *                difuso, porque cualquier otro corto le queda cerca.
 *
 * IMPORTANTE: esto PROPONE. Que la libreta corresponda a esa moto lo
 * afirma una persona, y queda registrado con nombre y fecha.
 */
/**
 * Cuántos caracteres de diferencia se admiten, según el largo del número.
 * Un chasis (17) aguanta 2; una matrícula o un padrón (4-6) no aguanta
 * ninguno — y está bien: para esos alcanza la coincidencia exacta, la de
 * confusión de caracteres y la parcial.
 */
function toleranciaPara(largo) {
  if (largo < 7) return 0;
  if (largo < 12) return 1;
  return 2;
}

export function buscarIdentificador(texto, candidatos, minParcial = 3) {
  const q = canonizar(texto);
  if (q.length < 3) return [];
  const qp = plegar(texto);
  const tope = toleranciaPara(qp.length);
  const orden = { exacta: 0, confusion: 1, cola: 2, cerca: 3 };
  const salida = [];

  candidatos.forEach((c) => {
    const canon = canonizar(c.valor);
    // Un "X" de chasis inexistente no puede coincidir con nada.
    if (!canon || esSinDato(c.valor)) return;
    const pleg = plegar(c.valor);
    let tipo = null;
    if (canon === q) tipo = "exacta";
    else if (pleg === qp) tipo = "confusion";
    else if (q.length >= minParcial && (pleg.includes(qp) || qp.includes(pleg))) tipo = "cola";
    else if (tope > 0 && Math.abs(qp.length - pleg.length) <= tope
             && distancia(qp, pleg, tope) <= tope) tipo = "cerca";
    if (tipo) salida.push(Object.assign({}, c, { tipo, canon }));
  });

  return salida.sort((a, b) => orden[a.tipo] - orden[b.tipo]);
}

/**
 * ID determinístico de un documento, con el prefijo del campo que lo
 * identifica: `doc-ch-…` por chasis, `doc-mo-…` por motor, `doc-ma-…` por
 * matrícula. El prefijo evita que un motor y un chasis con el mismo número
 * choquen, y bajar en la lista permite guardar libretas sin chasis —que
 * son muchas, en motos viejas— sin que se pisen entre ellas.
 * Devuelve null si no hay ningún identificador real.
 */
export function idDocumento({ chasis, motor, matricula } = {}) {
  if (!esSinDato(chasis)) return "doc-ch-" + canonizar(chasis);
  if (!esSinDato(motor)) return "doc-mo-" + canonizar(motor);
  if (!esSinDato(matricula)) return "doc-ma-" + canonizar(matricula);
  return null;
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

/* ---------- Teléfonos ----------
   Un teléfono tiene DOS formas y no son intercambiables:

     · la que se le muestra a una persona lleva el «+» del código de país.
       Sin él, «59899123456» no se lee como un número: se lee como un error.
     · la que pide la API de WhatsApp NO lo lleva. wa.me quiere dígitos pelados.

   La regla es guardar y mostrar la primera, y armar la segunda en el momento
   de usarla. Al revés —guardar sin «+» porque así lo quiere wa.me— es dejar
   que el formato de un tercero decida cómo se le habla a la gente.

   Las dos funciones toleran cualquier entrada: con «+», sin «+», con espacios
   o con guiones. Eso es a propósito, porque hay números guardados de antes. */

/** Solo dígitos de un teléfono. Es lo que pide la API de WhatsApp, y nada más. */
export function soloDigitos(t) {
  return String(t || "").replace(/\D/g, "");
}

/** El teléfono como se le muestra a una persona: con el «+» del código de país. */
export function telVisible(t) {
  const d = soloDigitos(t);
  return d ? "+" + d : "";
}

/* Lo que está objetivamente mal en un teléfono internacional. Devuelve el
   aviso, o "" si no hay nada que decir. No adivina el país: sólo tres cosas
   que no pueden ser.

   La del 0 es la que de verdad pasa: en Uruguay el número se dicta «098…»,
   y ese 0 es para llamar DENTRO del país. Ningún código de país empieza con
   0, así que un número que arranca en 0 nunca va a abrir un chat — wa.me
   contesta con una página de error, no con el chat, y desde el panel eso no
   se ve. El máximo de 15 dígitos es el del estándar E.164. */
export function avisoDeTelefono(t) {
  const d = soloDigitos(t);
  if (!d) return "";
  if (d[0] === "0") return "El número empieza con 0. Ese 0 sirve para llamar dentro del "
    + "país; WhatsApp necesita el código de país. Uruguay es 598: +598 y el número sin el 0.";
  if (d.length < 8) return "El número parece corto: son " + d.length
    + " dígitos y con el código de país tendrían que ser al menos 8.";
  if (d.length > 15) return "El número parece largo: son " + d.length
    + " dígitos y un teléfono internacional no pasa de 15.";
  return "";
}

/** El enlace para abrir un chat de WhatsApp. Acá —y en ningún otro lado— es
    donde el «+» se saca, porque es el único lugar donde estorba. */
export function urlWhatsapp(telefono, texto) {
  const d = soloDigitos(telefono);
  if (!d) return "";
  return "https://wa.me/" + d + (texto ? "?text=" + encodeURIComponent(texto) : "");
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
