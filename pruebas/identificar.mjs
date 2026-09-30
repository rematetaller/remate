// =====================================================
// pruebas/identificar.mjs — Banco de la función que identifica la foto
//
//   node pruebas/identificar.mjs
//
// Sin npm, sin red. Corre `api/identificar.mjs` de verdad con Gemini,
// Firestore y las claves de Google simulados, y tokens firmados acá con un
// par de claves propio. Prueba sobre todo lo que NO hace: atender a quien no
// tiene inventario, a un origen ajeno, sin clave, o creerle a una respuesta
// rota del modelo.
// =====================================================

import assert from "node:assert/strict";
import crypto from "node:crypto";

let pasadas = 0, fallidas = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallidas++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}
const titulo = (t) => console.log(`\n${t}`);

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = publicKey.export({ type: "spki", format: "pem" });
const KID = "clave-de-prueba", PROYECTO = "remate-acbc9", ORIGEN = "https://rematetaller.github.io";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function token(cuerpo = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const p = { aud: PROYECTO, iss: `https://securetoken.google.com/${PROYECTO}`, sub: "uid-" + Math.random(), iat: ahora - 30, exp: ahora + 3600, ...cuerpo };
  const c = b64({ alg: "RS256", kid: KID, typ: "JWT" }), q = b64(p);
  return `${c}.${q}.${crypto.createSign("RSA-SHA256").update(`${c}.${q}`).sign(privateKey).toString("base64url")}`;
}

process.env.ORIGENES_PERMITIDOS = ORIGEN;
process.env.GEMINI_API_KEY = "clave-de-prueba";
let ficha = { activo: true, rol: "", permisos: { inventario: true } };
let gemini = { ok: true, status: 200, cuerpo: null };
let pedidoAGemini = null;
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  if (u.includes("googleapis.com/robot")) return { ok: true, headers: { get: () => "max-age=3600" }, json: async () => ({ [KID]: PEM }) };
  if (u.includes("firestore.googleapis.com")) return { ok: true, status: 200, json: async () => ({ fields: {
    activo: { booleanValue: ficha.activo }, rol: { stringValue: ficha.rol }, nombre: { stringValue: "Alguien" },
    permisos: { mapValue: { fields: Object.fromEntries(Object.entries(ficha.permisos).map(([k, v]) => [k, { booleanValue: v }])) } } } }) };
  if (u.includes("generativelanguage.googleapis.com")) { pedidoAGemini = { url: u, op, cuerpo: JSON.parse(op.body) }; return { ok: gemini.ok, status: gemini.status, json: async () => gemini.cuerpo }; }
  throw new Error("pedido inesperado: " + u);
};
const respuestaGemini = (texto, chunks = []) => ({ candidates: [{ content: { parts: [{ text: texto }] }, groundingMetadata: { groundingChunks: chunks } }] });
const BUENA = JSON.stringify({ nombre: "Taladro percutor Bosch GSB 13 RE", tipo: "taladro percutor", marca: "Bosch", modelo: "GSB 13 RE",
  descripcion: "Taladro percutor de 650 W.", especificaciones: [{ dato: "Potencia", valor: "650 W" }, { dato: "", valor: "x" }],
  categoria: "herramientas eléctricas", estadoVisible: null, confianza: "alta", dudas: [], precio: 1000 });

const mod = await import("../api/identificar.mjs");
const { default: manejador, leerRespuesta, fuentesDe, autorizar, armarPrompt } = mod;
function pedido({ metodo = "POST", tok = token(), origen = ORIGEN, cuerpo = { imagen: "QUJD", mime: "image/jpeg", categorias: ["Herramientas eléctricas", "Repuestos"] } } = {}) {
  const res = { codigo: null, cuerpo: null, cabeceras: {}, setHeader(k, v) { this.cabeceras[k] = v; },
    status(c) { this.codigo = c; return this; }, json(o) { this.cuerpo = o; return this; }, end() { return this; } };
  const headers = {}; if (origen) headers.origin = origen; if (tok) headers.authorization = "Bearer " + tok;
  return { req: { method: metodo, headers, body: cuerpo }, res };
}
const correr = async (o) => { const p = pedido(o); await manejador(p.req, p.res); return p.res; };

titulo("Quién puede pedirlo");
await prueba("un origen ajeno no pasa", async () => { assert.equal((await correr({ origen: "https://otro.com" })).codigo, 403); });
await prueba("sin sesión no pasa", async () => { assert.equal((await correr({ tok: null })).codigo, 401); });
await prueba("un token de otro proyecto no pasa", async () => { assert.equal((await correr({ tok: token({ aud: "otro" }) })).codigo, 401); });
await prueba("sin el permiso de inventario no pasa; con él o siendo admin, sí", async () => {
  assert.equal(autorizar({ activo: true, rol: "", permisos: { luces: true } }), "tu cuenta no tiene habilitado el inventario");
  assert.equal(autorizar({ activo: false, rol: "admin", permisos: {} }), "tu cuenta está desactivada");
  assert.equal(autorizar({ activo: true, rol: "admin", permisos: {} }), null);
  ficha = { activo: true, rol: "", permisos: { luces: true } };
  assert.equal((await correr()).codigo, 403);
  ficha = { activo: true, rol: "", permisos: { inventario: true } };
});

titulo("Lo que se le manda a Gemini");
await prueba("sin la clave en Vercel lo dice, en vez de fallar raro", async () => {
  delete process.env.GEMINI_API_KEY;
  const r = await correr();
  assert.equal(r.codigo, 503); assert.ok(/GEMINI_API_KEY/.test(r.cuerpo.motivo));
  process.env.GEMINI_API_KEY = "clave-de-prueba";
});
await prueba("una foto que no es imagen, o demasiado grande, se rechaza antes de gastar", async () => {
  pedidoAGemini = null;
  assert.equal((await correr({ cuerpo: { imagen: "QUJD", mime: "application/pdf" } })).codigo, 400);
  assert.equal((await correr({ cuerpo: { imagen: "A".repeat(2_600_000), mime: "image/jpeg" } })).codigo, 413);
  assert.equal((await correr({ cuerpo: { imagen: "<script>", mime: "image/jpeg" } })).codigo, 400);
  assert.equal(pedidoAGemini, null);
});
await prueba("va con la búsqueda de Google, la clave en la cabecera y nunca en la dirección", async () => {
  gemini = { ok: true, status: 200, cuerpo: respuestaGemini(BUENA) };
  const r = await correr();
  assert.equal(r.codigo, 200);
  assert.deepEqual(pedidoAGemini.cuerpo.tools, [{ google_search: {} }]);
  assert.equal(pedidoAGemini.op.headers["x-goog-api-key"], "clave-de-prueba");
  assert.ok(!pedidoAGemini.url.includes("clave-de-prueba"), "la clave no va en la URL");
  assert.equal(pedidoAGemini.cuerpo.contents[0].parts[1].inline_data.mime_type, "image/jpeg");
});
await prueba("la misma persona no puede disparar pedidos seguidos", async () => {
  const t = token({ sub: "uid-fijo" });
  assert.equal((await correr({ tok: t })).codigo, 200);
  assert.equal((await correr({ tok: t })).codigo, 429);
});
await prueba("el prompt pide no inventar, no poner precios, y trae las categorías y la pista", () => {
  const p = armarPrompt({ categorias: ["Repuestos"], pista: "motor de portón" });
  assert.ok(/NO inventes/.test(p) && /NO pongas precios/.test(p) && /«Repuestos»/.test(p) && /motor de portón/.test(p));
});

titulo("Lo que vuelve");
await prueba("una respuesta buena llega limpia, sin precio, con la categoría que existe", async () => {
  gemini = { ok: true, status: 200, cuerpo: respuestaGemini("```json\n" + BUENA + "\n```", [
    { web: { uri: "https://www.bosch.com/gsb13", title: "Bosch" } }, { web: { uri: "https://www.bosch.com/gsb13", title: "Bosch" } },
    { web: { uri: "javascript:alert(1)", title: "x" } }]) };
  const r = await correr();
  assert.equal(r.cuerpo.ok, true);
  const p = r.cuerpo.producto;
  assert.equal(p.marca, "Bosch"); assert.equal(p.categoria, "Herramientas eléctricas");
  assert.equal(p.especificaciones.length, 1, "la especificación sin nombre se descarta");
  assert.ok(!("precio" in p));
  assert.deepEqual(r.cuerpo.fuentes, [{ titulo: "Bosch", url: "https://www.bosch.com/gsb13" }]);
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
await prueba("si Gemini falla o contesta basura, se dice y no se inventa nada", async () => {
  gemini = { ok: false, status: 429, cuerpo: { error: { message: "cuota agotada" } } };
  let r = await correr();
  assert.equal(r.codigo, 502); assert.ok(/cuota agotada/.test(r.cuerpo.motivo));
  gemini = { ok: true, status: 200, cuerpo: respuestaGemini("perdón, no puedo") };
  r = await correr();
  assert.equal(r.codigo, 502); assert.ok(/a mano/.test(r.cuerpo.motivo));
});
await prueba("las fuentes son sólo https y sin repetir", () => {
  assert.deepEqual(fuentesDe({ groundingMetadata: { groundingChunks: [{ web: { uri: "http://x.com" } }, { web: { uri: "https://a.com", title: "A" } }] } }),
    [{ titulo: "A", url: "https://a.com" }]);
  assert.deepEqual(fuentesDe({}), []);
});

console.log(`\n  ${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas ? 1 : 0);
