// =====================================================
// api/_sesion.mjs — Quién pide, y si puede. Lo comparten las funciones.
//
// Nació adentro de `api/tuya.mjs` (tanda 25) y se mudó acá en la tanda 30,
// cuando entró la segunda función (`api/identificar.mjs`): la verificación
// de la sesión es UNA, y una copia en cada función sería un lugar más donde
// equivocarse. Vercel no publica como función un archivo de `api/` que
// empieza con guion bajo: esto es un módulo, no una dirección.
//
// Las dos mitades, que conviene no confundir (ver el encabezado de tuya.mjs):
//   1. AUTENTICAR — la firma RS256 del ID token de Firebase, contra las
//      claves públicas de Google.
//   2. AUTORIZAR — `usuarios/{uid}` leído con ESE MISMO token, así que las
//      reglas de Firestore se aplican igual que desde el navegador.
// Sin credencial de servidor de Firebase: a propósito.
// =====================================================

import crypto from "node:crypto";

// El projectId de Firebase es público por diseño (está en utils.js y en la
// documentación). Va como constante y no como variable de entorno a
// propósito: si se cargara mal, los tokens se verificarían contra OTRO
// proyecto — y eso no falla ruidosamente, falla aceptando a quien no debe.
export const PROYECTO_FIREBASE = "remate-acbc9";

export const CERTS_GOOGLE =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// ---------- Los orígenes permitidos (CORS) ----------
// El panel vive en GitHub Pages y las funciones en Vercel: son dos orígenes
// distintos. La lista es blanca y explícita — un "*" acá dejaría que
// cualquier página del mundo usara la sesión de quien la visite.
export function origenesPermitidos() {
  return (process.env.ORIGENES_PERMITIDOS || "https://rematetaller.github.io")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

// El panel vive en GitHub Pages y esta función en Vercel: son dos orígenes
// distintos, así que sin esto el navegador ni siquiera manda el pedido.
// La lista es blanca y explícita — un "*" acá dejaría que cualquier página
// del mundo usara la sesión de quien la visite.
export function aplicarCors(req, res, cfg) {
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

export async function verificarToken(idToken) {
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
export async function fichaDe(uid, idToken) {
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
    // Tanda 30: el mapa entero, para que cada función pregunte por el suyo.
    permisos: Object.fromEntries(Object.entries(permisos).map(([k, v]) => [k, v?.booleanValue === true])),
  };
}

