// =====================================================
// pruebas/identificar.mjs — Banco de «qué es lo de la foto»
//
//   node pruebas/identificar.mjs
//
// Sin npm, sin red. Corre `interno/identificar.js` de verdad con la función
// de Casa Verde simulada. Prueba sobre todo lo que NO hace: creerle a un precio mal formado,
// inventar una categoría, creerle a una respuesta rota o a un enlace raro, y
// romperse cuando la función de Casa Verde todavía no sabe buscar.
// =====================================================

import assert from "node:assert/strict";
import { armarPrompt, leerRespuesta, leerPrecio, limpiarFuentes, pedirIdentificacion, FUNCION_IA, MODELO }
  from "../interno/identificar.js";

let pasadas = 0, fallidas = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallidas++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}
const titulo = (t) => console.log(`\n${t}`);

const BUENA = JSON.stringify({ nombre: "Taladro percutor Bosch GSB 13 RE", tipo: "taladro percutor", marca: "Bosch", modelo: "GSB 13 RE",
  descripcion: "Taladro percutor de 650 W.", especificaciones: [{ dato: "Potencia", valor: "650 W" }, { dato: "", valor: "x" }],
  categoria: "herramientas eléctricas", estadoVisible: null, confianza: "alta", dudas: [],
  precio: { valor: "$ 4.500", minimo: 3500, maximo: 6000, moneda: "UYU", base: "3 usados en MercadoLibre Uruguay" } });
const CATS = ["Herramientas eléctricas", "Repuestos"];

let ultimo = null;
const simular = (estado, cuerpo) => async (url, op) => {
  ultimo = { url, op, cuerpo: JSON.parse(op.body) };
  return { ok: estado < 400, status: estado, json: async () => cuerpo };
};
const pedir = (cuerpoRespuesta, estado = 200, datos = {}) =>
  pedirIdentificacion({ imagen: "QUJD", mime: "image/jpeg", categorias: CATS, ...datos }, { fetch: simular(estado, cuerpoRespuesta) });

titulo("Lo que se le manda a la función de Casa Verde");
await prueba("va a claude-proxy, con la foto, el prompt y la búsqueda pedida", async () => {
  await pedir({ content: [{ type: "text", text: BUENA }] });
  assert.equal(ultimo.url, FUNCION_IA);
  assert.ok(/serene-scone-76bd4e\.netlify\.app\/\.netlify\/functions\/claude-proxy$/.test(ultimo.url));
  assert.equal(ultimo.cuerpo.model, MODELO);
  assert.notEqual(MODELO, "gemini-2.5-flash", "el que piensa corta el JSON");
  assert.ok(ultimo.cuerpo.max_tokens >= 4000);
  assert.equal(ultimo.cuerpo.buscar, true);
  const partes = ultimo.cuerpo.messages[0].content;
  assert.equal(partes[0].type, "image"); assert.equal(partes[0].source.media_type, "image/jpeg");
  assert.ok(/EN URUGUAY/.test(partes[1].text) && /"precio"/.test(partes[1].text));
});
await prueba("no manda credenciales: la clave vive en Netlify", async () => {
  await pedir({ content: [{ type: "text", text: BUENA }] });
  assert.deepEqual(Object.keys(ultimo.op.headers), ["Content-Type"]);
  assert.ok(!/key|clave|token|Bearer/i.test(JSON.stringify(ultimo.op.headers)));
});
await prueba("una foto ilegible no gasta un pedido", async () => {
  ultimo = null;
  const r = await pedirIdentificacion({ imagen: "<script>" }, { fetch: simular(200, {}) });
  assert.equal(r.ok, false); assert.equal(ultimo, null);
  assert.equal((await pedirIdentificacion({ imagen: "" }, { fetch: simular(200, {}) })).ok, false);
});
await prueba("un tipo de imagen raro se manda como jpeg", async () => {
  await pedir({ content: [{ type: "text", text: BUENA }] }, 200, { mime: "image/heic" });
  assert.equal(ultimo.cuerpo.messages[0].content[0].source.media_type, "image/jpeg");
});
await prueba("el prompt pide no inventar, un precio de Uruguay con fundamento, y trae las categorías y la pista", () => {
  const p = armarPrompt({ categorias: ["Repuestos"], pista: "motor de portón" });
  assert.ok(/NO inventes/.test(p) && /Uruguay/.test(p) && /precio va null/.test(p) && /«Repuestos»/.test(p) && /motor de portón/.test(p));
});

titulo("Lo que vuelve");
await prueba("una respuesta buena llega limpia, con su precio y la categoría que existe", async () => {
  const r = await pedir({ content: [{ type: "text", text: "```json\n" + BUENA.slice(0, 40) }, { type: "text", text: BUENA.slice(40) + "\n```" }],
    fuentes: [{ titulo: "Bosch", url: "https://www.bosch.com/gsb13" }, { titulo: "Bosch", url: "https://www.bosch.com/gsb13" },
      { titulo: "x", url: "javascript:alert(1)" }] });
  assert.equal(r.ok, true);
  assert.equal(r.producto.marca, "Bosch"); assert.equal(r.producto.categoria, "Herramientas eléctricas");
  assert.equal(r.producto.especificaciones.length, 1, "la especificación sin nombre se descarta");
  assert.deepEqual(r.producto.precio, { valor: 4500, minimo: 3500, maximo: 6000, moneda: "UYU", base: "3 usados en MercadoLibre Uruguay" });
  assert.deepEqual(r.fuentes, [{ titulo: "Bosch", url: "https://www.bosch.com/gsb13" }]);
  assert.equal(r.buscoEnInternet, true);
});
await prueba("si la función todavía no sabe buscar, anda igual y lo dice", async () => {
  const r = await pedir({ content: [{ type: "text", text: BUENA }] });
  assert.equal(r.ok, true); assert.deepEqual(r.fuentes, []); assert.equal(r.buscoEnInternet, false);
});
await prueba("una categoría inventada por el modelo no se usa", () => {
  assert.equal(leerRespuesta(JSON.stringify({ categoria: "Cosas" }), ["Repuestos"]).categoria, null);
});
await prueba("texto antes del JSON se tolera; basura, no", () => {
  assert.equal(leerRespuesta('Acá va: {"nombre":"Amoladora"} listo').nombre, "Amoladora");
  assert.equal(leerRespuesta("no sé qué es"), null);
  assert.equal(leerRespuesta("{roto"), null);
  assert.equal(leerRespuesta('{"nombre":"null","marca":"  "}').nombre, null);
  assert.equal(leerRespuesta('{"confianza":"total"}').confianza, "baja");
});
await prueba("si la IA falla o contesta basura, se dice y no se inventa nada", async () => {
  let r = await pedir({ error: "Límite de uso de Gemini alcanzado." }, 429);
  assert.equal(r.ok, false); assert.ok(/Límite de uso/.test(r.motivo) && /a mano/.test(r.motivo));
  r = await pedir({ content: [{ type: "text", text: "perdón, no puedo" }] });
  assert.equal(r.ok, false); assert.ok(/a mano/.test(r.motivo));
  r = await pedir({});
  assert.equal(r.ok, false);
  r = await pedir({ content: [{ type: "text", text: '{"nombre":"Tala' }], warning: "Respuesta truncada" });
  assert.equal(r.ok, false); assert.ok(/cortada/.test(r.motivo));
});
await prueba("sin red, o si tarda, se dice en vez de quedarse girando", async () => {
  let r = await pedirIdentificacion({ imagen: "QUJD" }, { fetch: async () => { throw new TypeError("fetch failed"); } });
  assert.equal(r.ok, false); assert.ok(/internet/.test(r.motivo));
  r = await pedirIdentificacion({ imagen: "QUJD" }, { esperaMs: 20, fetch: (u, op) => new Promise((_, no) =>
    op.signal.addEventListener("abort", () => no(Object.assign(new Error("abortado"), { name: "AbortError" })))) });
  assert.equal(r.ok, false); assert.ok(/tardó/.test(r.motivo));
});
await prueba("un precio que no cierra no llega: sin valor, negativo, absurdo, o con un rango que no lo contiene", () => {
  assert.equal(leerPrecio(null), null);
  assert.equal(leerPrecio({ valor: null, moneda: "UYU" }), null);
  assert.equal(leerPrecio({ valor: -5 }), null);
  assert.equal(leerPrecio({ valor: 1e12 }), null);
  assert.equal(leerPrecio({ valor: "consultar" }), null);
  const p = leerPrecio({ valor: 100, minimo: 200, maximo: 50, moneda: "US$ (USD)" });
  assert.deepEqual(p, { valor: 100, minimo: null, maximo: null, moneda: "USD", base: null });
  assert.equal(leerPrecio({ valor: "1.250,50", moneda: "pesos" }).valor, 1251);
  assert.equal(leerPrecio({ valor: 300, moneda: "EUR" }), null, "una moneda desconocida no se adivina");
  assert.equal(leerPrecio({ valor: 300 }), null);
  assert.equal(leerPrecio({ valor: 300, moneda: "dólares" }).moneda, "USD");
  assert.equal(leerRespuesta('{"nombre":"x","precio":null}').precio, null);
});
await prueba("las fuentes son sólo https y sin repetir", () => {
  assert.deepEqual(limpiarFuentes([{ url: "http://x.com" }, { url: "https://a.com", titulo: "A" }, null]), [{ titulo: "A", url: "https://a.com" }]);
  assert.deepEqual(limpiarFuentes(undefined), []);
});

console.log(`\n  ${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas ? 1 : 0);
