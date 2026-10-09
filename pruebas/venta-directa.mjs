// =====================================================
// pruebas/venta-directa.mjs — Banco de la venta directa (remate:V1)
//
//   node pruebas/venta-directa.mjs
//
// Sin npm, sin red. Corre `interno/venta-directa.js` de verdad. Prueba sobre
// todo lo que NO tiene que pasar: trabar una venta por un dato que se puede
// completar después, duplicar un artículo o un comprador que ya estaba,
// dejar stock negativo, mezclar monedas, y que la venta salga con otra forma
// que la que nace de un pedido (el post-venta la lee igual).
// =====================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import { armarVentaDirecta, clave, compradorExistente, productoExistente, idNuevo } from "../interno/venta-directa.js";

let pasadas = 0, fallidas = 0;
async function prueba(nombre, fn) {
  try { await fn(); pasadas++; console.log(`  ✓ ${nombre}`); }
  catch (e) { fallidas++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}
const titulo = (t) => console.log(`\n${t}`);

const AHORA = Date.UTC(2026, 9, 8, 15, 0);
const VENDEDOR = { uid: "u-flor", nombre: "Florencia" };
const PRODUCTOS = [
  { id: "p1", nombre: "Taladro Bosch", cantidad: 3, precioSugerido: 4500, moneda: "UYU", ubicacion: "Estante 2" },
  { id: "p2", nombre: "Amoladora", cantidad: 1, precioSugerido: 80, moneda: "USD" },
];
const COMPRADORES = [{ id: "c1", nombre: "Juan Pérez", telefono: "099 123 456" }];
const base = (extra = {}) => ({ moneda: "UYU", vendedor: VENDEDOR, productos: PRODUCTOS, compradores: COMPRADORES,
  ahoraMs: AHORA, items: [{ nombre: "Casco", precio: "1500" }], ...extra });

titulo("Lo mínimo: qué se vendió y a cuánto");
await prueba("un casco sin comprador, sin foto, sin categoría y sin cobro entra igual", () => {
  const r = armarVentaDirecta(base());
  assert.equal(r.errores, undefined);
  assert.equal(r.total, 1500);
  assert.equal(r.venta.datos.comprador.nombre, "Venta directa");
  assert.equal(r.comprador, null);
  assert.deepEqual(r.venta.datos.pago.registros, []);
});
await prueba("sin artículo no hay venta", () => {
  assert.match(armarVentaDirecta(base({ items: [] })).errores[0], /Falta qué se vendió/);
  assert.match(armarVentaDirecta(base({ items: [{ nombre: "", precio: "" }] })).errores[0], /Falta qué se vendió/);
});
await prueba("sin precio no hay venta, pero precio 0 sí (un regalo es una venta a 0)", () => {
  assert.ok(armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "" }] })).errores.some((e) => /precio/.test(e)));
  assert.equal(armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "0" }] })).total, 0);
});
await prueba("un precio con coma decimal se lee bien", () => {
  assert.equal(armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "1500,50" }] })).total, 1500.5);
});
await prueba("la cantidad vacía es 1; cero, negativa o con decimales no", () => {
  assert.equal(armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "10", cantidad: "" }] })).venta.datos.items[0].cantidad, 1);
  for (const c of ["0", "-2", "1.5", "dos"])
    assert.ok(armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "10", cantidad: c }] })).errores, c);
});
await prueba("la moneda es UYU o USD, y sin vendedor no se guarda", () => {
  assert.ok(armarVentaDirecta(base({ moneda: "ARS" })).errores);
  assert.ok(armarVentaDirecta(base({ vendedor: {} })).errores);
});

titulo("El artículo: el que estaba se descuenta, el nuevo nace vendido");
await prueba("un artículo nuevo se da de alta sin stock, con el precio y sin foto", () => {
  const r = armarVentaDirecta(base({ items: [{ nombre: "Casco", descripcion: "Talle M", precio: "1500", categoriaId: "cat9" }] }));
  assert.equal(r.productosNuevos.length, 1);
  const p = r.productosNuevos[0].datos;
  assert.equal(p.cantidad, 0); assert.equal(p.estado, "agotado");      // no aparece en el catálogo
  assert.equal(p.precioSugerido, 1500); assert.equal(p.moneda, "UYU");
  assert.deepEqual(p.fotos, []); assert.equal(p.descripcion, "Talle M"); assert.equal(p.categoriaId, "cat9");
  assert.equal(r.venta.datos.items[0].productoId, r.productosNuevos[0].id);
});
await prueba("el que ya estaba (por nombre, sin importar mayúsculas ni tildes) NO se duplica: se descuenta", () => {
  const r = armarVentaDirecta(base({ items: [{ nombre: "taladro  bosch", precio: "4000", cantidad: "2" }] }));
  assert.equal(r.productosNuevos.length, 0);
  assert.deepEqual(r.descuentos, [{ id: "p1", cantidad: 1, estado: "disponible" }]);
  assert.equal(r.venta.datos.items[0].descripcion, "Taladro Bosch");
});
await prueba("el stock nunca baja de cero, y llegar a cero lo marca agotado", () => {
  const r = armarVentaDirecta(base({ items: [{ nombre: "Taladro Bosch", precio: "1", cantidad: "5" }] }));
  assert.deepEqual(r.descuentos, [{ id: "p1", cantidad: 0, estado: "agotado" }]);
});
await prueba("varios artículos: el total suma precio × cantidad de cada uno", () => {
  const r = armarVentaDirecta(base({ items: [{ nombre: "Casco", precio: "1500" }, { nombre: "Guantes", precio: "250", cantidad: "2" }] }));
  assert.equal(r.total, 2000);
  assert.deepEqual(r.venta.datos.totales, { UYU: 2000, USD: 0 });
  assert.equal(r.productosNuevos.length, 2);
  assert.notEqual(r.productosNuevos[0].id, r.productosNuevos[1].id);
});
await prueba("en dólares el total va a USD y nunca se suma a pesos", () => {
  const r = armarVentaDirecta(base({ moneda: "USD", items: [{ nombre: "Amoladora", precio: "80" }] }));
  assert.deepEqual(r.venta.datos.totales, { UYU: 0, USD: 80 });
  assert.equal(r.venta.datos.items[0].moneda, "USD");
});

titulo("El comprador: el que estaba se usa, el nuevo se registra");
await prueba("por nombre (sin tildes ni mayúsculas) o por teléfono, se usa el que ya estaba", () => {
  assert.equal(armarVentaDirecta(base({ comprador: { nombre: "juan perez" } })).comprador.id, "c1");
  const r = armarVentaDirecta(base({ comprador: { nombre: "J. Pérez", telefono: "099123456" } }));
  assert.equal(r.comprador.id, "c1"); assert.equal(r.comprador.nuevo, false);
  assert.equal(r.venta.datos.compradorId, "c1");
});
await prueba("uno nuevo se registra con su nombre y teléfono, y la venta lo lleva adentro", () => {
  const r = armarVentaDirecta(base({ comprador: { nombre: "Ana", telefono: "098 000 111" } }));
  assert.equal(r.comprador.nuevo, true);
  assert.equal(r.comprador.datos.nombre, "Ana"); assert.equal(r.comprador.datos.creadoPor, "u-flor");
  assert.deepEqual(r.venta.datos.comprador, { nombre: "Ana", telefono: "098 000 111" });
});
await prueba("sólo con teléfono, el teléfono hace de nombre (la regla pide un nombre)", () => {
  assert.equal(armarVentaDirecta(base({ comprador: { telefono: "098 777" } })).comprador.datos.nombre, "098 777");
});
await prueba("un teléfono corto no confunde a dos personas", () => {
  assert.equal(compradorExistente([{ nombre: "X", telefono: "12" }], "Otro", "12"), null);
});

titulo("El cobro y la entrega");
await prueba("pagó todo: un registro con la forma del post-venta", () => {
  const r = armarVentaDirecta(base({ cobro: { monto: 1500, metodo: "Efectivo", nota: "en mano" } }));
  const g = r.venta.datos.pago.registros;
  assert.equal(g.length, 1);
  assert.deepEqual(Object.keys(g[0]).sort(), ["fecha", "metodo", "moneda", "monto", "nota", "registradoNombre", "registradoPor"]);
  assert.equal(g[0].moneda, "UYU"); assert.equal(g[0].registradoPor, "u-flor");
});
await prueba("un cobro sin método o con un monto raro se dice, en vez de guardarse mal", () => {
  assert.ok(armarVentaDirecta(base({ cobro: { monto: 100, metodo: "" } })).errores);
  assert.ok(armarVentaDirecta(base({ cobro: { monto: "mucho", metodo: "Efectivo" } })).errores);
  assert.equal(armarVentaDirecta(base({ cobro: { monto: "", metodo: "" } })).errores, undefined);
});
await prueba("entregada deja su renglón en el historial; si no, queda pendiente", () => {
  const a = armarVentaDirecta(base({ entregada: true })).venta.datos.entrega;
  assert.equal(a.estado, "entregada"); assert.equal(a.historial[0].por, "u-flor");
  assert.deepEqual(armarVentaDirecta(base()).venta.datos.entrega, { estado: "pendiente", historial: [] });
});
await prueba("la fecha elegida viaja; sin fecha, es ahora", () => {
  const ayer = AHORA - 86400000;
  assert.equal(armarVentaDirecta(base({ fechaMs: ayer })).venta.datos.fechaMs, ayer);
  assert.equal(armarVentaDirecta(base()).venta.datos.fechaMs, AHORA);
});

titulo("La forma: la misma que una venta de pedido");
await prueba("los campos de la venta son los del §4, más origen y compradorId", () => {
  const v = armarVentaDirecta(base()).venta;
  assert.match(v.id, /^venta-dir-/);
  assert.deepEqual(Object.keys(v.datos).sort(), ["comprador", "compradorId", "entrega", "fechaMs", "items", "llaveCodigo",
    "origen", "pago", "totales", "vendedorNombre", "vendedorUid"]);
  assert.equal(v.datos.origen, "directa");
  assert.deepEqual(Object.keys(v.datos.items[0]).sort(), ["cantidad", "descripcion", "esLote", "moneda", "precioFinal", "productoId"]);
});
await prueba("clave() y los ids", () => {
  assert.equal(clave("  Cásco   ROJO "), "casco rojo");
  assert.match(idNuevo("p", AHORA, () => 0.5), /^p-[a-z0-9]+$/);
  assert.equal(productoExistente(PRODUCTOS, { productoId: "p2" }).nombre, "Amoladora");
});

titulo("La pantalla y las reglas");
const html = fs.readFileSync(new URL("../interno/ventas.html", import.meta.url), "utf8");
const reglas = fs.readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
await prueba("el botón es de quien valida, y todo va en UN lote", () => {
  assert.match(html, /if \(puede\("validar"\)\)/);
  assert.match(html, /writeBatch\(db\)/);
  assert.match(html, /b\.commit\(\)/);
});
await prueba("la foto se sube al guardar, nunca al elegirla", () => {
  const elegir = /inp\.onchange = \(\) => \{[\s\S]*?\};/.exec(html)[0];
  assert.ok(!/subirFoto/.test(elegir));
  assert.match(html, /async function guardarVD[\s\S]*subirFoto/);
});
await prueba("cámara y archivos son dos inputs (la lección de Casa Verde)", () => {
  assert.match(html, /id="vdCamara" accept="image\/\*" capture="environment"/);
  assert.match(html, /id="vdGaleria" accept="image\/\*"/);
});
await prueba("lo que escribió alguien se escapa antes de ir a la pantalla", () => {
  assert.match(html, /escapar\(it\.descripcion\)/);
  assert.match(html, /escapar\(\(v\.comprador && v\.comprador\.nombre\) \|\| "—"\)/);
});
await prueba("reglas v1.1: compradores con su bloque, y de una venta directa sólo cambia el comprador", () => {
  assert.match(reglas, /Cambios respecto de la v1\.0 \(remate:V1, la venta directa\)/);
  const c = /match \/compradores\/\{id\} \{([\s\S]*?)\n    \}/.exec(reglas)[1];
  assert.match(c, /allow read: if activo\(\);/);
  assert.match(c, /allow create, update: if puede\('validar'\)/);
  const v = /match \/ventas\/\{id\} \{([\s\S]*?)\n    \}/.exec(reglas)[1];
  assert.match(v, /resource\.data\.get\('origen', ''\) == 'directa'\s*&& cambios\(\)\.hasOnly\(\['comprador', 'compradorId'\]\)/);
  assert.ok(!/hasOnly\(\[[^\]]*items/.test(v), "los artículos de una venta no se tocan");
});

console.log(`\n  ${pasadas} pasadas, ${fallidas} fallidas\n`);
process.exit(fallidas ? 1 : 0);
