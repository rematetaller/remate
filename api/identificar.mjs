// =====================================================
// api/identificar.mjs — Qué es lo de la foto · el inventario con Gemini
//
// Pedido de Mauro, 30-sep-2026: «al cargar la imagen, además de reducirla
// para Cloudinary, que con Gemini se busque en internet el detalle y la
// descripción de ese componente, para que quien hace el inventario lo tenga
// en el formulario para corregir y revisar antes de guardarlo».
//
// Es la SEGUNDA función de servidor de remateTaller (la primera es la de
// las luces, `api/tuya.mjs`), y existe por la misma razón: la clave de la
// API de Gemini es un secreto, y un secreto no vive en el navegador. El
// panel manda la foto ya reducida y su ID token; acá se verifica quién es,
// se mira que pueda cargar inventario, y recién ahí se le pregunta a Gemini
// —con la búsqueda de Google encendida— qué es y cómo se describe.
//
// ── LO QUE DEVUELVE ES UNA PROPUESTA ─────────────────────────────────
// No escribe nada en la base. El formulario la muestra, la persona la
// corrige, y guarda ella. Y no trae PRECIOS: poner precio es el permiso
// `validar`, no el de inventario, y un precio sacado de internet para un
// usado de remate sería una promesa falsa.
//
// ── SECRETOS ─────────────────────────────────────────────────────────
// GEMINI_API_KEY (y opcional GEMINI_MODELO) en Vercel → Settings →
// Environment Variables, cargadas por Mauro a mano. Nunca en el repo.
// =====================================================

import { aplicarCors, verificarToken, fichaDe, origenesPermitidos } from "./_sesion.mjs";

export const VERSION = "api-identificar-remate 1.0";
const MODELO_POR_DEFECTO = "gemini-2.5-flash";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BASE64 = 2_500_000;          // ~1,8 MB de imagen: la del panel viene a 800 px
const MINIMO_MS = 4000;                 // entre dos pedidos de la misma persona

export function autorizar(ficha) {
  if (!ficha.activo) return "tu cuenta está desactivada";
  if (ficha.rol === "admin") return null;
  if (ficha.permisos && ficha.permisos.inventario === true) return null;
  return "tu cuenta no tiene habilitado el inventario";
}

export function armarPrompt({ categorias = [], pista = "" } = {}) {
  return [
    "Sos el asistente de inventario de un remate de herramientas, máquinas, repuestos y artículos usados en Uruguay.",
    "Te paso la foto de UN artículo. Hacé dos cosas:",
    "1) Identificá qué es: el tipo de artículo, y la marca y el modelo si se ven (placa, etiqueta, grabado).",
    "2) Buscá en internet la ficha de ese modelo para escribir la descripción técnica.",
    "REGLAS: lo que no se ve en la foto ni encontrás, va null. NO inventes una marca ni un modelo. Si algo te genera duda, poné el nombre del campo en \"dudas\". NO pongas precios.",
    pista ? `La persona que carga el inventario anotó: «${String(pista).slice(0, 120)}». Tomalo como pista, no como verdad.` : "",
    "Devolvé SOLO un objeto JSON, sin texto antes ni después y sin ``` alrededor, con esta forma:",
    JSON.stringify({
      nombre: "corto, como se vende. Ej: Taladro percutor Bosch GSB 13 RE",
      tipo: "qué es, en dos o tres palabras", marca: null, modelo: null,
      descripcion: "2 a 4 renglones: qué es, para qué sirve y sus datos técnicos principales",
      especificaciones: [{ dato: "Potencia", valor: "650 W" }],
      categoria: categorias.length ? "una de la lista de abajo, o null" : null,
      estadoVisible: "lo que se ve del estado (óxido, piezas faltantes, golpes), o null",
      confianza: "alta | media | baja", dudas: [],
    }),
    categorias.length ? "Categorías posibles: " + categorias.map((c) => `«${c}»`).join(", ") + "." : "",
  ].filter(Boolean).join("\n");
}

/* Lo que devolvió el modelo, limpio: un JSON aunque venga con ``` o con
   una frase antes, y cada campo con su tamaño. Lo que no entiende, null. */
export function leerRespuesta(texto, categorias = []) {
  const t = String(texto || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let x;
  try { x = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!x || typeof x !== "object") return null;
  const txt = (v, n) => (typeof v === "string" && v.trim() && v.trim().toLowerCase() !== "null" ? v.trim().slice(0, n) : null);
  const cat = txt(x.categoria, 60);
  return {
    nombre: txt(x.nombre, 120), tipo: txt(x.tipo, 60), marca: txt(x.marca, 60), modelo: txt(x.modelo, 80),
    descripcion: txt(x.descripcion, 800),
    especificaciones: (Array.isArray(x.especificaciones) ? x.especificaciones : [])
      .map((e) => ({ dato: txt(e && e.dato, 60), valor: txt(e && e.valor, 120) }))
      .filter((e) => e.dato && e.valor).slice(0, 12),
    // Sólo una categoría que exista: una inventada no la elige ningún <select>.
    categoria: cat && categorias.find((c) => c.toLowerCase() === cat.toLowerCase()) || null,
    estadoVisible: txt(x.estadoVisible, 300),
    confianza: ["alta", "media", "baja"].includes(x.confianza) ? x.confianza : "baja",
    dudas: (Array.isArray(x.dudas) ? x.dudas : []).map((d) => txt(d, 40)).filter(Boolean).slice(0, 10),
  };
}

/* De dónde sacó la descripción: las páginas que usó la búsqueda. */
export function fuentesDe(candidato) {
  const chunks = (candidato && candidato.groundingMetadata && candidato.groundingMetadata.groundingChunks) || [];
  const vistas = new Set();
  return chunks.map((c) => c && c.web).filter((w) => w && typeof w.uri === "string" && /^https:\/\//.test(w.uri))
    .filter((w) => !vistas.has(w.uri) && vistas.add(w.uri))
    .map((w) => ({ titulo: String(w.title || w.uri).slice(0, 120), url: w.uri })).slice(0, 6);
}

const ultimoPorUid = new Map();

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const origenOk = aplicarCors(req, res, { origenes: origenesPermitidos() });
  if (req.method === "OPTIONS") return res.status(origenOk ? 204 : 403).end();
  if (!origenOk) return res.status(403).json({ ok: false, motivo: "origen no permitido" });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, motivo: "método no permitido" });
  }

  const cabecera = req.headers.authorization || "";
  const idToken = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  if (!idToken) return res.status(401).json({ ok: false, motivo: "falta la sesión" });
  let quien, ficha;
  try {
    quien = await verificarToken(idToken);
    ficha = await fichaDe(quien.uid, idToken);
  } catch (e) {
    return res.status(401).json({ ok: false, motivo: e.message });
  }
  const negado = autorizar(ficha);
  if (negado) return res.status(403).json({ ok: false, motivo: negado });

  const clave = process.env.GEMINI_API_KEY || "";
  if (!clave) return res.status(503).json({ ok: false, motivo: "falta la variable de entorno GEMINI_API_KEY en Vercel" });

  let cuerpo = req.body;
  if (typeof cuerpo === "string") { try { cuerpo = JSON.parse(cuerpo); } catch { cuerpo = null; } }
  if (!cuerpo || typeof cuerpo !== "object") return res.status(400).json({ ok: false, motivo: "cuerpo JSON inválido" });
  const imagen = String(cuerpo.imagen || "");
  const mime = String(cuerpo.mime || "");
  if (!TIPOS.includes(mime)) return res.status(400).json({ ok: false, motivo: "la foto tiene que ser JPG, PNG o WebP" });
  if (!imagen || !/^[A-Za-z0-9+/=]+$/.test(imagen)) return res.status(400).json({ ok: false, motivo: "falta la foto" });
  if (imagen.length > MAX_BASE64) return res.status(413).json({ ok: false, motivo: "la foto es demasiado grande" });
  const categorias = (Array.isArray(cuerpo.categorias) ? cuerpo.categorias : [])
    .filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().slice(0, 40)).slice(0, 60);

  const ahora = Date.now();
  if (ahora - (ultimoPorUid.get(quien.uid) || 0) < MINIMO_MS)
    return res.status(429).json({ ok: false, motivo: "esperá unos segundos entre una foto y otra" });
  ultimoPorUid.set(quien.uid, ahora);

  const modelo = (process.env.GEMINI_MODELO || MODELO_POR_DEFECTO).replace(/[^\w.-]/g, "");
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": clave },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { text: armarPrompt({ categorias, pista: cuerpo.pista }) },
          { inline_data: { mime_type: mime, data: imagen } },
        ] }],
        // La búsqueda de Google: la descripción sale de la ficha del modelo,
        // no de lo que el modelo «se acuerda».
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ ok: false, motivo: "Gemini no contestó bien: " + ((j.error && j.error.message) || r.status) });
    const cand = (j.candidates || [])[0] || {};
    const texto = ((cand.content && cand.content.parts) || []).map((p) => p.text || "").join("");
    const producto = leerRespuesta(texto, categorias);
    if (!producto) return res.status(502).json({ ok: false, motivo: "Gemini contestó algo que no se pudo leer; probá de nuevo o cargalo a mano" });
    return res.status(200).json({ ok: true, version: VERSION, modelo, producto, fuentes: fuentesDe(cand) });
  } catch (e) {
    return res.status(502).json({ ok: false, motivo: e.name === "TimeoutError" ? "Gemini tardó demasiado" : (e.message || "error hablando con Gemini") });
  }
}
