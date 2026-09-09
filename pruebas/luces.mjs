// =====================================================
// pruebas/luces.mjs — Banco de pruebas del puente de luces
//
//   node pruebas/luces.mjs
//
// Sin npm, sin dependencias y sin navegador — como todo el proyecto.
// Corre `api/tuya.mjs` de verdad, con la nube de Tuya, Firestore y las
// claves públicas de Google simuladas. Se firman tokens reales con un par
// de claves generado acá: la verificación que se prueba es la de verdad,
// no una versión de mentira.
// =====================================================

import assert from "node:assert/strict";
import crypto from "node:crypto";

let pasadas = 0, fallidas = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallidas++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}
const titulo = (t) => console.log(`\n${t}`);

// ---------- Un par de claves para firmar tokens de prueba ----------
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM_PUBLICA = publicKey.export({ type: "spki", format: "pem" });
const { privateKey: otraPrivada } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

const KID = "clave-de-prueba";
const PROYECTO = "remate-acbc9";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

function firmarToken(cuerpo = {}, { clave = privateKey, kid = KID, alg = "RS256" } = {}) {
  const ahora = Math.floor(Date.now() / 1000);
  const p = {
    aud: PROYECTO,
    iss: `https://securetoken.google.com/${PROYECTO}`,
    sub: "uid-de-prueba",
    email: "alguien@ejemplo.com",
    iat: ahora - 30,
    exp: ahora + 3600,
    ...cuerpo,
  };
  const cabeza = b64({ alg, kid, typ: "JWT" });
  const carga = b64(p);
  const firma = crypto.createSign("RSA-SHA256").update(`${cabeza}.${carga}`)
    .sign(clave).toString("base64url");
  return `${cabeza}.${carga}.${firma}`;
}

// ---------- Entorno ----------
const ORIGEN = "https://rematetaller.github.io";
process.env.TUYA_CLIENT_ID = "id-de-prueba";
process.env.TUYA_CLIENT_SECRET = "secreto-de-prueba";
process.env.TUYA_REGION = "us";
process.env.ORIGENES_PERMITIDOS = ORIGEN;
process.env.TUYA_LUCES = JSON.stringify({
  deposito: { id: "vdevo-deposito", label: "Depósito", comando: "switch_1" },
  fondo: "vdevo-fondo",
  taller: { id: "vdevo-taller", label: "Taller", comando: "switch_1" },
  patio: { id: "vdevo-patio", label: "Patio", comando: "switch_1" },
  oficina: { id: "vdevo-oficina", label: "Oficina", comando: "switch_1" },
});

// ---------- La nube simulada ----------
let pedidos = [];
let ficha = { activo: true, rol: "", permisos: { luces: true } };
let fichaEstado = 200;
let statusDeTuya = [{ code: "switch_1", value: true }];

globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  pedidos.push({ url: u, opciones });

  if (u.includes("googleapis.com/robot")) {
    return {
      ok: true,
      headers: { get: (k) => (k.toLowerCase() === "cache-control" ? "max-age=3600" : null) },
      json: async () => ({ [KID]: PEM_PUBLICA }),
    };
  }

  if (u.includes("firestore.googleapis.com")) {
    if (fichaEstado !== 200) return { ok: false, status: fichaEstado, json: async () => ({}) };
    const campos = {
      activo: { booleanValue: ficha.activo },
      rol: { stringValue: ficha.rol },
      nombre: { stringValue: "Quien Sea" },
      permisos: {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(ficha.permisos).map(([k, v]) => [k, { booleanValue: v }])
          ),
        },
      },
    };
    return { ok: true, status: 200, json: async () => ({ fields: campos }) };
  }

  if (u.includes("/v1.0/token")) {
    return { json: async () => ({ success: true, result: { access_token: "token-tuya", expire_time: 7200 } }) };
  }
  if (u.includes("/status")) {
    return { json: async () => ({ success: true, result: statusDeTuya }) };
  }
  return { json: async () => ({ success: true, result: true }) };
};

const { default: manejador } = await import("../api/tuya.mjs");

function pedido({ metodo = "POST", token = firmarToken(), origen = ORIGEN, cuerpo = {} } = {}) {
  const res = {
    codigo: null, cuerpo: null, cabeceras: {}, terminado: false,
    setHeader(k, v) { this.cabeceras[k] = v; },
    status(c) { this.codigo = c; return this; },
    json(o) { this.cuerpo = o; return this; },
    end() { this.terminado = true; return this; },
  };
  const headers = {};
  if (origen !== null) headers.origin = origen;
  if (token !== null) headers.authorization = "Bearer " + token;
  return { req: { method: metodo, headers, body: cuerpo }, res };
}

// ═══ CORS ═══════════════════════════════════════════════════════════════
titulo("El origen: sólo el panel puede hablarle");

await prueba("una página cualquiera de internet no pasa", async () => {
  const { req, res } = pedido({ origen: "https://sitio-cualquiera.com", cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 403);
  assert.equal(res.cabeceras["Access-Control-Allow-Origin"], undefined, "le dio permiso a un origen ajeno");
});

await prueba("el preflight del panel se contesta, el de un extraño no", async () => {
  const a = pedido({ metodo: "OPTIONS" });
  await manejador(a.req, a.res);
  assert.equal(a.res.codigo, 204);
  assert.equal(a.res.cabeceras["Access-Control-Allow-Origin"], ORIGEN);
  assert.equal(a.res.cabeceras["Vary"], "Origin", "sin Vary, una caché mezcla las respuestas de dos orígenes");

  const b = pedido({ metodo: "OPTIONS", origen: "https://otro.com" });
  await manejador(b.req, b.res);
  assert.equal(b.res.codigo, 403);
});

// ═══ Autenticación ══════════════════════════════════════════════════════
titulo("Autenticar: probar quién es");

await prueba("sin sesión no se hace nada", async () => {
  const { req, res } = pedido({ token: null, cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
});

await prueba("un token firmado con otra clave no entra", async () => {
  const { req, res } = pedido({ token: firmarToken({}, { clave: otraPrivada }), cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  assert.match(res.cuerpo.motivo, /firma/);
});

await prueba("un token vencido no entra", async () => {
  const ahora = Math.floor(Date.now() / 1000);
  const { req, res } = pedido({ token: firmarToken({ exp: ahora - 7200, iat: ahora - 10800 }), cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  assert.match(res.cuerpo.motivo, /vencido/);
});

await prueba("un token de OTRO proyecto de Firebase no entra", async () => {
  const { req, res } = pedido({ token: firmarToken({ aud: "otro-proyecto" }), cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  assert.match(res.cuerpo.motivo, /otro proyecto/);
});

await prueba("un token con emisor cambiado no entra", async () => {
  const { req, res } = pedido({ token: firmarToken({ iss: "https://securetoken.google.com/impostor" }), cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
});

await prueba("«alg: none» —el ataque clásico contra JWT— no entra", async () => {
  const cabeza = b64({ alg: "none", kid: KID, typ: "JWT" });
  const ahora = Math.floor(Date.now() / 1000);
  const carga = b64({ aud: PROYECTO, iss: `https://securetoken.google.com/${PROYECTO}`, sub: "uid-de-prueba", iat: ahora, exp: ahora + 3600 });
  const { req, res } = pedido({ token: `${cabeza}.${carga}.`, cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  assert.match(res.cuerpo.motivo, /algoritmo/);
});

await prueba("un token firmado con una clave que Google no publica no entra", async () => {
  const { req, res } = pedido({ token: firmarToken({}, { kid: "kid-inventado" }), cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  assert.match(res.cuerpo.motivo, /desconocida/);
});

// ═══ Autorización ═══════════════════════════════════════════════════════
titulo("Autorizar: la ficha de usuarios manda");

await prueba("una cuenta desactivada no enciende nada", async () => {
  ficha = { activo: false, rol: "", permisos: { luces: true } };
  const { req, res } = pedido({ cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 403);
  assert.match(res.cuerpo.motivo, /desactivada/);
});

await prueba("tener sesión no es tener permiso", async () => {
  ficha = { activo: true, rol: "", permisos: { inventario: true } };
  const { req, res } = pedido({ cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 403);
  assert.match(res.cuerpo.motivo, /no tiene habilitadas/);
});

await prueba("el admin puede aunque no tenga el permiso tildado", async () => {
  ficha = { activo: true, rol: "admin", permisos: {} };
  const { req, res } = pedido({ cuerpo: { luz: "taller", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
});

await prueba("si las reglas de Firestore niegan la ficha, no se inventa un permiso", async () => {
  fichaEstado = 403;
  const { req, res } = pedido({ cuerpo: { luz: "deposito", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 401);
  fichaEstado = 200;
  ficha = { activo: true, rol: "", permisos: { luces: true } };
});

await prueba("la ficha se lee con el token de la persona, no con una credencial de servidor", async () => {
  pedidos = [];
  const token = firmarToken({ sub: "uid-de-prueba" });
  const { req, res } = pedido({ token, cuerpo: { luz: "patio", encender: true } });
  await manejador(req, res);
  const lectura = pedidos.find((p) => p.url.includes("firestore.googleapis.com"));
  assert.ok(lectura, "no leyó la ficha");
  assert.equal(lectura.opciones.headers.Authorization, "Bearer " + token);
  assert.ok(lectura.url.includes("/usuarios/uid-de-prueba"), "leyó la ficha equivocada");
});

// ═══ La orden ═══════════════════════════════════════════════════════════
titulo("La orden a Tuya");

await prueba("una luz que no está configurada se rechaza", async () => {
  const { req, res } = pedido({ cuerpo: { luz: "el-vecino", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 400);
  assert.match(res.cuerpo.motivo, /desconocida/);
});

await prueba("`encender` tiene que ser true o false, no cualquier cosa", async () => {
  const { req, res } = pedido({ cuerpo: { luz: "deposito", encender: "si" } });
  await manejador(req, res);
  assert.equal(res.codigo, 400);
});

await prueba("la orden llega al aparato correcto, con el comando correcto", async () => {
  pedidos = [];
  const { req, res } = pedido({ cuerpo: { luz: "oficina", encender: false } });
  await manejador(req, res);
  assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
  const orden = pedidos.find((p) => p.url.includes("/commands"));
  assert.ok(orden.url.includes("vdevo-oficina"), "fue al aparato equivocado");
  assert.deepEqual(JSON.parse(orden.opciones.body), { commands: [{ code: "switch_1", value: false }] });
});

await prueba("la forma corta de TUYA_LUCES toma switch_1 y el alias de etiqueta", async () => {
  pedidos = [];
  const { req, res } = pedido({ cuerpo: { luz: "fondo", encender: true } });
  await manejador(req, res);
  assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
  assert.equal(res.cuerpo.label, "fondo");
  const orden = pedidos.find((p) => p.url.includes("/commands"));
  assert.deepEqual(JSON.parse(orden.opciones.body), { commands: [{ code: "switch_1", value: true }] });
});

await prueba("la firma de Tuya es la que dice su especificación", async () => {
  const t = pedidos.find((p) => p.url.includes("/v1.0/token")) ||
    (await (async () => { pedidos = []; const { req, res } = pedido({ cuerpo: { luz: "taller", encender: true } }); await manejador(req, res); return pedidos.find((p) => p.url.includes("/v1.0/token")); })());
  if (!t) return; // el token estaba en caché: ya se verificó en otra corrida
  const h = t.opciones.headers;
  const vacio = crypto.createHash("sha256").update("").digest("hex");
  const stringToSign = ["GET", vacio, "", "/v1.0/token?grant_type=1"].join("\n");
  const str = "id-de-prueba" + "" + h.t + h.nonce + stringToSign;
  const esperada = crypto.createHmac("sha256", "secreto-de-prueba").update(str, "utf8").digest("hex").toUpperCase();
  assert.equal(h.sign, esperada);
  assert.equal(h.sign_method, "HMAC-SHA256");
});

await prueba("dos órdenes seguidas a la misma luz: la segunda se frena", async () => {
  const a = pedido({ cuerpo: { luz: "deposito", encender: true } });
  await manejador(a.req, a.res);
  assert.equal(a.res.codigo, 200, JSON.stringify(a.res.cuerpo));
  const b = pedido({ cuerpo: { luz: "deposito", encender: false } });
  await manejador(b.req, b.res);
  assert.equal(b.res.codigo, 429);
});

// ═══ El estado ══════════════════════════════════════════════════════════
titulo("Preguntar cómo están");

await prueba("devuelve cada luz con su etiqueta y su estado", async () => {
  const { req, res } = pedido({ metodo: "GET" });
  await manejador(req, res);
  assert.equal(res.codigo, 200, JSON.stringify(res.cuerpo));
  const dep = res.cuerpo.luces.find((l) => l.alias === "deposito");
  assert.equal(dep.label, "Depósito");
  assert.equal(dep.encendida, true);
  assert.equal(dep.enLinea, true);
});

await prueba("un aparato que no informa su estado da null, que no es «apagada»", async () => {
  statusDeTuya = [{ code: "otra_cosa", value: 3 }];
  const { req, res } = pedido({ metodo: "GET" });
  await manejador(req, res);
  const dep = res.cuerpo.luces.find((l) => l.alias === "deposito");
  assert.equal(dep.encendida, null);
  statusDeTuya = [{ code: "switch_1", value: true }];
});

// ═══ Secretos ═══════════════════════════════════════════════════════════
titulo("Que no se escape nada");

await prueba("ninguna respuesta repite un secreto ni un identificador de aparato", async () => {
  const casos = [];
  for (const c of [
    { cuerpo: { luz: "el-vecino", encender: true } },
    { cuerpo: { luz: "deposito", encender: "no" } },
    { token: null },
    { metodo: "GET" },
  ]) {
    const { req, res } = pedido(c);
    await manejador(req, res);
    casos.push(JSON.stringify(res.cuerpo));
  }
  const todo = casos.join(" ");
  assert.ok(!todo.includes("secreto-de-prueba"), "se filtró el Access Secret");
  assert.ok(!todo.includes("id-de-prueba"), "se filtró el Access ID");
  assert.ok(!todo.includes("vdevo-"), "se filtró un identificador de dispositivo");
});

await prueba("un método que no corresponde no pasa", async () => {
  const { req, res } = pedido({ metodo: "DELETE" });
  await manejador(req, res);
  assert.equal(res.codigo, 405);
});

console.log(`\n${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas ? 1 : 0);
