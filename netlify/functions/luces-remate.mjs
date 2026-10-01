// =====================================================
// netlify/functions/luces-remate.mjs — El puente de luces, servido por Netlify
//
// 1-oct-2026. El puente (`api/tuya.mjs`) se escribió para Vercel, y el
// proyecto de Vercel no se pudo crear: conectar la cuenta de GitHub
// `rematetaller` con la de Vercel daba vueltas sin terminar nunca. Mauro:
// «hazlo, porque me sigue dando vueltas». Se sirve desde el Netlify de Casa
// Verde (`serene-scone-76bd4e`), donde ya viven claude-proxy y los avisos
// por WhatsApp y que se despliega con un zip a mano. Así las claves de
// servidor del ecosistema están en UNA consola.
//
// Este archivo NO tiene lógica: traduce el pedido de Netlify (`event`) al
// `req`/`res` de Vercel que espera `api/tuya.mjs`, y la respuesta de vuelta.
// El puente sigue siendo uno solo, con su banco (`node pruebas/luces.mjs`).
//
// ── EL ZIP ──────────────────────────────────────────────────────────
// El código fuente vive en ESTE repositorio. El zip de Netlify lleva este
// archivo en `netlify/functions/` y `api/tuya.mjs` + `api/_sesion.mjs` en
// `api/`, con las MISMAS rutas que acá, para que el `import` de abajo
// resuelva igual. Ver `LUCES.md` § 3.
// =====================================================

import manejador from "../../api/tuya.mjs";

export const handler = async (event) => {
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) headers[k.toLowerCase()] = v;
  let body = event.body ?? null;
  if (body && event.isBase64Encoded) body = Buffer.from(body, "base64").toString("utf8");

  const salida = { statusCode: 200, headers: {}, body: "" };
  const res = {
    setHeader(k, v) { salida.headers[k] = String(v); return this; },
    status(c) { salida.statusCode = c; return this; },
    json(o) {
      salida.headers["Content-Type"] = "application/json; charset=utf-8";
      salida.body = JSON.stringify(o);
      return this;
    },
    end() { return this; },
  };
  await manejador({ method: event.httpMethod, headers, body }, res);
  return salida;
};
