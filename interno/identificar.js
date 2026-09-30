// =====================================================
// identificar.js — Qué es lo de la foto · el inventario con Gemini (v1.1)
//
// Pedido de Mauro, 30-sep-2026: «al cargar la imagen, además de reducirla
// para Cloudinary, que con Gemini se busque en internet el detalle y la
// descripción de ese componente, para que quien hace el inventario lo tenga
// en el formulario para corregir y revisar antes de guardarlo».
//
// ── POR QUÉ NO HAY FUNCIÓN PROPIA ────────────────────────────────────
// La IA ya estaba puesta: es `claude-proxy`, la función de Netlify de Casa
// Verde que lee las facturas, con la clave de Gemini cargada allá. Tiempos
// ya la usa para las boletas, desde el navegador y del mismo modo. La
// primera versión de esta tanda armaba una función nueva en Vercel con su
// propia clave; Mauro avisó que la IA ya existía y se volvió a esto: un
// solo lugar con la clave, que es el que ya andaba.
//
// Con `buscar: true` la función enciende la búsqueda de Google y devuelve
// las `fuentes`. Una función de Casa Verde que todavía no se actualizó
// ignora ese campo y contesta igual, sin fuentes: el formulario lo dice
// («es sólo lo que se ve en la foto») y no falla.
//
// ── LO QUE DEVUELVE ES UNA PROPUESTA ─────────────────────────────────
// No escribe nada en la base. El formulario la muestra, la persona la
// corrige, y guarda ella. Y no trae PRECIOS: poner precio es el permiso
// `validar`, no el de inventario, y un precio sacado de internet para un
// usado de remate sería una promesa falsa.
//
// Este archivo no importa nada, a propósito: así lo corre el banco
// (`node pruebas/identificar.mjs`) sin navegador y sin Firebase.
// =====================================================

export const VERSION_IDENTIFICAR = "identificar-1.1";
export const FUNCION_IA = "https://serene-scone-76bd4e.netlify.app/.netlify/functions/claude-proxy";
// El mismo que usa la lectura de facturas por defecto. NO `gemini-2.5-flash`:
// ése piensa antes de contestar y el pensamiento se come `max_tokens`, así
// que el JSON llega cortado. Pasó en la primera prueba real, el 30-sep.
export const MODELO = "gemini-2.5-flash-lite";
export const TIPOS = ["image/jpeg", "image/png", "image/webp"];

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

/* De dónde sacó la descripción: sólo https y sin repetir. Lo que llega
   de afuera se filtra acá, no en la pantalla. */
export function limpiarFuentes(lista) {
  const vistas = new Set();
  return (Array.isArray(lista) ? lista : [])
    .filter((f) => f && typeof f.url === "string" && /^https:\/\//.test(f.url))
    .filter((f) => !vistas.has(f.url) && vistas.add(f.url))
    .map((f) => ({ titulo: String(f.titulo || f.url).slice(0, 120), url: f.url })).slice(0, 6);
}

/**
 * Le pregunta a la función de Casa Verde. `fetch` se inyecta para que el
 * banco lo pueda simular. → { ok:true, producto, fuentes, buscoEnInternet }
 * o { ok:false, motivo }. Nunca tira: un error se devuelve dicho.
 */
export async function pedirIdentificacion({ imagen, mime = "image/jpeg", categorias = [], pista = "" } = {},
  { fetch: pedir = globalThis.fetch, esperaMs = 30000 } = {}) {
  if (!imagen || !/^[A-Za-z0-9+/=]+$/.test(imagen)) return { ok: false, motivo: "No se pudo leer la foto." };
  if (!TIPOS.includes(mime)) mime = "image/jpeg";
  const cats = (Array.isArray(categorias) ? categorias : [])
    .filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().slice(0, 40)).slice(0, 60);
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), esperaMs);
  try {
    const r = await pedir(FUNCION_IA, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: 4000, buscar: true, messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: mime, data: imagen } },
        { type: "text", text: armarPrompt({ categorias: cats, pista }) },
      ] }] }),
      signal: corte.signal,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, motivo: "La IA no contestó bien: " + (j.error || r.status) + ". Cargalo a mano." };
    const texto = (Array.isArray(j.content) ? j.content : []).map((p) => (p && p.text) || "").join("");
    const producto = leerRespuesta(texto, cats);
    if (!producto) return { ok: false, motivo: j.warning
      ? "La respuesta de la IA llegó cortada; probá de nuevo o cargalo a mano."
      : "La IA contestó algo que no se pudo leer; probá de nuevo o cargalo a mano." };
    return { ok: true, producto, fuentes: limpiarFuentes(j.fuentes), buscoEnInternet: Array.isArray(j.fuentes) };
  } catch (e) {
    return { ok: false, motivo: e && e.name === "AbortError" ? "La IA tardó demasiado. Probá de nuevo o cargalo a mano."
      : "No se pudo llegar a la IA. ¿Hay internet?" };
  } finally {
    clearTimeout(reloj);
  }
}
