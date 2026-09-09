// =====================================================
// api/tuya.js — El puente a Tuya · las luces del depósito
//
// Es la ÚNICA pieza de servidor de remateTaller, y existe por una razón
// concreta: la nube de Tuya exige firmar cada pedido con un secreto
// (HMAC-SHA256), y un secreto no puede vivir en el navegador. Todo lo
// demás del sistema sigue siendo estático, servido por GitHub Pages.
//
// ── QUIÉN PUEDE ENCENDER ─────────────────────────────────────────────
// No hay contraseña compartida. El panel manda el ID token de Firebase de
// la persona que tiene la sesión abierta, y acá se hacen DOS cosas
// distintas que conviene no confundir:
//
//   1. AUTENTICAR — se verifica la firma RS256 del token contra las
//      claves públicas de Google. Eso prueba QUIÉN es, y que el token no
//      está vencido ni fabricado.
//   2. AUTORIZAR — se lee `usuarios/{uid}` por la API REST de Firestore
//      USANDO ESE MISMO TOKEN, no una credencial de servidor. Así la
//      lectura pasa por las reglas de Firestore igual que si la hiciera
//      el navegador, y quien decide sigue siendo `usuarios/{uid}`:
//      `activo == true` y `rol == 'admin'` o `permisos.luces == true`.
//
// Que no haya credencial de servidor de Firebase acá es deliberado: esta
// función no puede leer nada que la persona no pudiera leer por su cuenta.
// Un service account en Vercel sería una llave maestra de toda la base
// para prender una luz.
//
// ── SECRETOS ─────────────────────────────────────────────────────────
// Ningún valor real entra a este repositorio. Acá sólo están los NOMBRES;
// los valores los carga Mauro a mano en Vercel → Settings → Environment
// Variables. Ver `.env.example`, `LUCES.md` y `PROTOCOLO-SECRETOS.md` del
// repo privado `datos`.
// =====================================================

import crypto from "node:crypto";

const VERSION = "api-tuya-remate 1.0";

const ENDPOINTS = {
  us: "https://openapi.tuyaus.com",
  eu: "https://openapi.tuyaeu.com",
  cn: "https://openapi.tuyacn.com",
  in: "https://openapi.tuyain.com",
};

const SHA256_VACIO = crypto.createHash("sha256").update("").digest("hex");

// El projectId de Firebase es público por diseño (está en utils.js y en la
// documentación). Va como constante y no como variable de entorno a
// propósito: si se cargara mal, los tokens se verificarían contra OTRO
// proyecto — y eso no falla ruidosamente, falla aceptando a quien no debe.
const PROYECTO_FIREBASE = "remate-acbc9";

const CERTS_GOOGLE =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// ---------- Configuración ----------
function configuracion() {
  const faltan = [];
  const clientId = process.env.TUYA_CLIENT_ID || "";
  const secret = process.env.TUYA_CLIENT_SECRET || "";
  if (!clientId) faltan.push("TUYA_CLIENT_ID");
  if (!secret) faltan.push("TUYA_CLIENT_SECRET");

  const region = (process.env.TUYA_REGION || "us").toLowerCase();
  const base = ENDPOINTS[region] || ENDPOINTS.us;

  let luces = {};
  let errorLuces = null;
  const crudo = process.env.TUYA_LUCES;
  if (crudo) {
    try {
      const parseado = JSON.parse(crudo);
      for (const [alias, v] of Object.entries(parseado)) {
        const d = typeof v === "string" ? { id: v } : (v || {});
        if (!d.id) continue;
        luces[alias] = {
          id: d.id,
          label: d.label || alias,
          comando: d.comando || "switch_1",
        };
      }
    } catch (e) {
      errorLuces = "TUYA_LUCES no es JSON válido";
    }
  } else {
    faltan.push("TUYA_LUCES");
  }

  const origenes = (process.env.ORIGENES_PERMITIDOS ||
    "https://rematetaller.github.io")
    .split(",").map((s) => s.trim()).filter(Boolean);

  return { clientId, secret, region, base, luces, origenes, faltan, errorLuces };
}

// ---------- CORS ----------
// El panel vive en GitHub Pages y esta función en Vercel: son dos orígenes
// distintos, así que sin esto el navegador ni siquiera manda el pedido.
// La lista es blanca y explícita — un "*" acá dejaría que cualquier página
// del mundo usara la sesión de quien la visite.
function aplicarCors(req, res, cfg) {
  const origen = req.headers.origin || "";
  if (cfg.origenes.includes(origen)) {
    res.setHeader("Access-Control-Allow-Origin", origen);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  }
  return false;
}

// ---------- Verificación del ID token de Firebase ----------
let certsGuardados = { valor: null, vence: 0 };

async function certificados() {
  if (certsGuardados.valor && Date.now() < certsGuardados.vence) return certsGuardados.valor;
  const r = await fetch(CERTS_GOOGLE);
  if (!r.ok) throw new Error("no se pudieron leer las claves públicas de Google");
  const json = await r.json();
  // Google dice en Cache-Control cuánto duran. Respetarlo evita pedirlas en
  // cada gesto y, sobre todo, evita quedarse con una clave rotada.
  const cc = r.headers.get("cache-control") || "";
  const m = cc.match(/max-age=(\d+)/);
  const segundos = m ? Number(m[1]) : 3600;
  certsGuardados = { valor: json, vence: Date.now() + Math.max(60, segundos) * 1000 };
  return json;
}

const base64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

async function verificarToken(idToken) {
  const partes = String(idToken || "").split(".");
  if (partes.length !== 3) throw new Error("token mal formado");

  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(base64url(partes[0]).toString("utf8"));
    cuerpo = JSON.parse(base64url(partes[1]).toString("utf8"));
  } catch (e) { throw new Error("token ilegible"); }

  if (cabecera.alg !== "RS256") throw new Error("algoritmo de firma inesperado");
  if (!cabecera.kid) throw new Error("token sin identificador de clave");

  const certs = await certificados();
  const cert = certs[cabecera.kid];
  if (!cert) throw new Error("el token está firmado con una clave desconocida");

  const ok = crypto.createVerify("RSA-SHA256")
    .update(`${partes[0]}.${partes[1]}`)
    .verify(cert, base64url(partes[2]));
  if (!ok) throw new Error("la firma del token no verifica");

  const ahora = Math.floor(Date.now() / 1000);
  const margen = 60; // reloj del teléfono contra reloj del servidor
  if (cuerpo.aud !== PROYECTO_FIREBASE) throw new Error("el token es de otro proyecto");
  if (cuerpo.iss !== `https://securetoken.google.com/${PROYECTO_FIREBASE}`) {
    throw new Error("emisor inesperado");
  }
  if (!cuerpo.sub) throw new Error("token sin usuario");
  if (typeof cuerpo.exp !== "number" || cuerpo.exp + margen < ahora) throw new Error("token vencido");
  if (typeof cuerpo.iat !== "number" || cuerpo.iat - margen > ahora) throw new Error("token del futuro");

  return { uid: cuerpo.sub, email: cuerpo.email || "" };
}

// ---------- Autorización: la ficha manda ----------
// Se lee con el token de la persona, así que las reglas de Firestore se
// aplican igual que desde el navegador. Si mañana las reglas cambian, esto
// cambia con ellas sin que haya que tocar nada acá.
async function fichaDe(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROYECTO_FIREBASE}` +
    `/databases/(default)/documents/usuarios/${encodeURIComponent(uid)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  if (r.status === 403 || r.status === 401) throw new Error("las reglas no dejan leer tu ficha");
  if (r.status === 404) throw new Error("tu cuenta no tiene ficha en el panel");
  if (!r.ok) throw new Error("no se pudo leer tu ficha");
  const json = await r.json();
  const f = json.fields || {};
  const permisos = f.permisos?.mapValue?.fields || {};
  return {
    activo: f.activo?.booleanValue === true,
    rol: f.rol?.stringValue || "",
    nombre: f.nombre?.stringValue || "",
    puedeLuces: permisos.luces?.booleanValue === true,
  };
}

function autorizar(ficha) {
  if (!ficha.activo) return "tu cuenta está desactivada";
  if (ficha.rol === "admin") return null;
  if (ficha.puedeLuces) return null;
  return "tu cuenta no tiene habilitadas las luces";
}

// ---------- Firma de Tuya ----------
function firmar({ metodo, url, cuerpo, clientId, secret, token, t, nonce }) {
  const hash = cuerpo ? crypto.createHash("sha256").update(cuerpo, "utf8").digest("hex") : SHA256_VACIO;
  const stringToSign = [metodo, hash, "", url].join("\n");
  const str = clientId + (token || "") + t + nonce + stringToSign;
  return crypto.createHmac("sha256", secret).update(str, "utf8").digest("hex").toUpperCase();
}

async function llamarTuya({ cfg, metodo, url, cuerpo = "", token = "" }) {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = firmar({ metodo, url, cuerpo, clientId: cfg.clientId, secret: cfg.secret, token, t, nonce });
  const cabeceras = {
    client_id: cfg.clientId, sign, t, nonce,
    sign_method: "HMAC-SHA256",
    "Content-Type": "application/json",
  };
  if (token) cabeceras.access_token = token;
  const r = await fetch(cfg.base + url, {
    method: metodo,
    headers: cabeceras,
    body: metodo === "GET" ? undefined : cuerpo,
    signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined,
  });
  return r.json();
}

let tokenTuya = { valor: null, vence: 0, region: null };

async function tokenDeTuya(cfg) {
  const ahora = Date.now();
  if (tokenTuya.valor && tokenTuya.region === cfg.region && ahora < tokenTuya.vence) return tokenTuya.valor;
  const res = await llamarTuya({ cfg, metodo: "GET", url: "/v1.0/token?grant_type=1" });
  if (!res || res.success !== true || !res.result?.access_token) {
    tokenTuya = { valor: null, vence: 0, region: null };
    throw new Error(res?.msg ? `Tuya rechazó las credenciales: ${res.msg}` : "Tuya no entregó token");
  }
  const segundos = Number(res.result.expire_time || 7200);
  tokenTuya = {
    valor: res.result.access_token,
    vence: ahora + Math.max(60, segundos - 60) * 1000,
    region: cfg.region,
  };
  return tokenTuya.valor;
}

// ---------- Freno ----------
// El del navegador se saltea abriendo las herramientas de desarrollo; éste no.
const ultimoPorLuz = new Map();
const MINIMO_MS = 700;

// ---------- Manejador ----------
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const cfg = configuracion();
  const origenOk = aplicarCors(req, res, cfg);

  if (req.method === "OPTIONS") return res.status(origenOk ? 204 : 403).end();
  if (!origenOk) return res.status(403).json({ ok: false, motivo: "origen no permitido" });

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

  if (cfg.faltan.length || cfg.errorLuces) {
    return res.status(503).json({
      ok: false,
      motivo: cfg.errorLuces || `faltan variables de entorno: ${cfg.faltan.join(", ")}`,
    });
  }

  // ── GET: qué luces hay y cómo están ──────────────────────────────────
  if (req.method === "GET") {
    try {
      const token = await tokenDeTuya(cfg);
      const luces = [];
      for (const [alias, d] of Object.entries(cfg.luces)) {
        let encendida = null;
        let enLinea = null;
        try {
          const r = await llamarTuya({
            cfg, metodo: "GET", token,
            url: `/v1.0/iot-03/devices/${encodeURIComponent(d.id)}/status`,
          });
          if (r?.success === true && Array.isArray(r.result)) {
            const dp = r.result.find((x) => x.code === d.comando);
            if (dp && typeof dp.value === "boolean") encendida = dp.value;
            enLinea = true;
          } else {
            enLinea = false;
          }
        } catch (e) { enLinea = false; }
        luces.push({ alias, label: d.label, encendida, enLinea });
      }
      return res.status(200).json({ ok: true, version: VERSION, quien: ficha.nombre || quien.email, luces });
    } catch (e) {
      return res.status(502).json({ ok: false, motivo: e.message || "error hablando con Tuya" });
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, OPTIONS");
    return res.status(405).json({ ok: false, motivo: "método no permitido" });
  }

  let cuerpo = req.body;
  if (typeof cuerpo === "string") { try { cuerpo = JSON.parse(cuerpo); } catch (e) { cuerpo = null; } }
  if (!cuerpo || typeof cuerpo !== "object") {
    return res.status(400).json({ ok: false, motivo: "cuerpo JSON inválido" });
  }

  const alias = String(cuerpo.luz || "");
  const d = cfg.luces[alias];
  if (!d) {
    return res.status(400).json({
      ok: false, motivo: `luz desconocida: ${alias || "(vacío)"}`,
      conocidas: Object.keys(cfg.luces),
    });
  }
  if (typeof cuerpo.encender !== "boolean") {
    return res.status(400).json({ ok: false, motivo: "`encender` tiene que ser true o false" });
  }

  const ahora = Date.now();
  const previo = ultimoPorLuz.get(alias) || 0;
  if (ahora - previo < MINIMO_MS) {
    return res.status(429).json({ ok: false, motivo: "demasiado seguido", esperar: MINIMO_MS - (ahora - previo) });
  }
  ultimoPorLuz.set(alias, ahora);

  try {
    let token = await tokenDeTuya(cfg);
    const url = `/v1.0/iot-03/devices/${encodeURIComponent(d.id)}/commands`;
    const payload = JSON.stringify({ commands: [{ code: d.comando, value: cuerpo.encender }] });
    let r = await llamarTuya({ cfg, metodo: "POST", url, cuerpo: payload, token });

    // 1010 = token vencido. Pasa cuando la instancia estuvo tibia más de lo
    // que duró el token; se pide uno nuevo y se reintenta una sola vez.
    if (r && r.success !== true && String(r.code) === "1010") {
      tokenTuya = { valor: null, vence: 0, region: null };
      token = await tokenDeTuya(cfg);
      r = await llamarTuya({ cfg, metodo: "POST", url, cuerpo: payload, token });
    }

    if (!r || r.success !== true) {
      return res.status(502).json({
        ok: false,
        motivo: r?.msg || "Tuya rechazó el comando",
        codigo: r?.code ?? null,
      });
    }
    return res.status(200).json({
      ok: true, luz: alias, label: d.label, encendida: cuerpo.encender, uid: quien.uid,
    });
  } catch (e) {
    return res.status(502).json({ ok: false, motivo: e.message || "error hablando con Tuya" });
  }
}
