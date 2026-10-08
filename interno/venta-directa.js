// =====================================================
// venta-directa.js — La venta que no pasa por una llave (v1.0, 8-oct-2026)
//
// Pedido de Mauro (remate:V1): «registrar la venta de un casco, y el casco no
// estaba dado de alta, y el cliente no estaba registrado: llenando los datos
// en un mismo formulario ya se da de alta al cliente, el artículo y la venta
// con su cobro… sin trabar el registro, para luego editar si es necesario».
//
// Este archivo NO toca Firebase: arma lo que hay que escribir y dice por qué
// no se puede, nada más. Lo escribe `ventas.html`, en UN lote (writeBatch):
// o entra todo —comprador, artículos, venta y cobro— o no entra nada. Así se
// prueba con `node pruebas/venta-directa.mjs`, sin navegador.
//
// Lo que se exige es lo mínimo para que la venta sea una venta: qué se vendió
// y a cuánto. El comprador, la foto, la categoría, la descripción y el cobro
// se pueden dejar para después. Una venta queda con la MISMA forma que la que
// nace de validar un pedido (§4 del Libro 1), más `origen: 'directa'`, así que
// el post-venta, los KPI y el historial del producto la leen sin cambios.
// =====================================================

export const MONEDAS = ["UYU", "USD"];

/** Forma de comparar dos nombres: sin mayúsculas, sin tildes, sin espacios de más. */
export function clave(t) {
  return String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return NaN;
  return Number(String(v).replace(/\s/g, "").replace(",", "."));
};

/** Un id corto y legible, con el prefijo de lo que es. */
export function idNuevo(prefijo, ahoraMs = Date.now(), azar = Math.random) {
  return prefijo + "-" + ahoraMs.toString(36) + azar().toString(36).slice(2, 6);
}

/** El comprador que ya existe con ese nombre (o ese teléfono), si hay uno. */
export function compradorExistente(compradores, nombre, telefono) {
  const n = clave(nombre), tel = String(telefono || "").replace(/\D/g, "");
  return (compradores || []).find((c) =>
    (n && clave(c.nombre) === n) || (tel.length >= 6 && String(c.telefono || "").replace(/\D/g, "") === tel)) || null;
}

/** El artículo del inventario con ese id, o con ese nombre exacto. */
export function productoExistente(productos, it) {
  if (it && it.productoId) return (productos || []).find((p) => p.id === it.productoId) || null;
  const n = clave(it && it.nombre);
  return n ? (productos || []).find((p) => clave(p.nombre) === n) || null : null;
}

/**
 * Arma todo lo de una venta directa.
 *
 * entrada: { comprador: {nombre, telefono, nota}, moneda, items: [{productoId?, nombre,
 *            descripcion, cantidad, precio, categoriaId, foto?}], cobro: {monto, metodo, nota},
 *            entregada, fechaMs, vendedor: {uid, nombre}, productos, compradores, ahoraMs }
 *
 * Devuelve { errores } si no se puede, o
 *   { comprador: {id, datos, nuevo}, productosNuevos: [{id, datos, indice}],
 *     descuentos: [{id, cantidad, estado}], venta: {id, datos}, total }
 * Las fechas van en ms (`fechaMs`, `creadoEnMs`): las convierte `ventas.html`.
 */
export function armarVentaDirecta(e) {
  const errores = [];
  const ahora = e.ahoraMs || Date.now();
  const moneda = MONEDAS.includes(e.moneda) ? e.moneda : null;
  if (!moneda) errores.push("Elegí la moneda.");
  const vendedor = e.vendedor || {};
  if (!vendedor.uid) errores.push("No se sabe quién vende: volvé a entrar.");

  const filas = (e.items || []).filter((it) => it && (clave(it.nombre) || it.productoId || String(it.precio || "").trim()));
  if (!filas.length) errores.push("Falta qué se vendió.");

  const productosNuevos = [], descuentos = [], items = [];
  let total = 0;
  filas.forEach((it, i) => {
    const etiqueta = filas.length > 1 ? `Artículo ${i + 1}: ` : "";
    const ex = productoExistente(e.productos, it);
    const nombre = String((ex && ex.nombre) || it.nombre || "").trim().slice(0, 120);
    if (!nombre) errores.push(etiqueta + "falta el nombre del artículo.");
    const cantidad = String(it.cantidad ?? "").trim() === "" ? 1 : num(it.cantidad);
    if (!(Number.isInteger(cantidad) && cantidad >= 1)) errores.push(etiqueta + "la cantidad va en unidades enteras, 1 o más.");
    const precio = num(it.precio);
    if (!(precio >= 0)) errores.push(etiqueta + "falta el precio (por unidad).");
    if (!nombre || !(Number.isInteger(cantidad) && cantidad >= 1) || !(precio >= 0)) return;

    let productoId;
    if (ex) {
      productoId = ex.id;
      // El stock se descuenta como al validar un pedido, y nunca baja de cero:
      // vender algo que el inventario no contaba no traba la venta.
      const queda = Math.max(0, Number(ex.cantidad || 0) - cantidad);
      descuentos.push({ id: ex.id, cantidad: queda, estado: queda > 0 ? "disponible" : "agotado" });
    } else {
      // Artículo nuevo: nace vendido. Cantidad 0 = agotado, así no aparece
      // en el catálogo público (que muestra sólo lo que tiene stock).
      productoId = idNuevo("p", ahora + i);
      productosNuevos.push({ id: productoId, indice: i, datos: {
        nombre, descripcion: String(it.descripcion || "").trim().slice(0, 2000),
        categoriaId: String(it.categoriaId || ""), cantidad: 0, ubicacion: "",
        moneda, precioSugerido: precio, precioLote: null, fotos: [], estado: "agotado",
        origen: "venta-directa", creadoEnMs: ahora } });
    }
    const precioFinal = Math.round(precio * cantidad * 100) / 100;
    total += precioFinal;
    items.push({ productoId, descripcion: nombre, cantidad, esLote: false, moneda, precioFinal });
  });

  // El comprador: el que ya existe con ese nombre o teléfono, o uno nuevo.
  // Sin nombre la venta entra igual, como «Venta directa», para completar después.
  const c = e.comprador || {};
  const nombreC = String(c.nombre || "").trim().slice(0, 120);
  const telC = String(c.telefono || "").trim().slice(0, 40);
  let comprador = null;
  if (nombreC || telC) {
    const ya = compradorExistente(e.compradores, nombreC, telC);
    comprador = ya
      ? { id: ya.id, nuevo: false, datos: { nombre: ya.nombre || nombreC, telefono: ya.telefono || telC } }
      : { id: idNuevo("c", ahora), nuevo: true, datos: { nombre: nombreC || telC, telefono: telC,
          nota: String(c.nota || "").trim().slice(0, 500), origen: "venta-directa", creadoPor: vendedor.uid || "", creadoEnMs: ahora } };
  }

  const cobro = e.cobro || {};
  const montoCobro = String(cobro.monto ?? "").trim() === "" ? 0 : num(cobro.monto);
  if (!(montoCobro >= 0)) errores.push("El cobro tiene que ser un número (o vacío si todavía no pagó).");
  else if (montoCobro > 0 && !String(cobro.metodo || "").trim()) errores.push("Elegí cómo pagó.");
  if (errores.length) return { errores };

  total = Math.round(total * 100) / 100;
  const fechaMs = Number(e.fechaMs) > 0 ? Number(e.fechaMs) : ahora;
  const registros = montoCobro > 0 ? [{ fecha: ahora, monto: montoCobro, moneda, metodo: String(cobro.metodo).trim(),
    nota: String(cobro.nota || "").trim().slice(0, 300), registradoPor: vendedor.uid, registradoNombre: vendedor.nombre || "" }] : [];
  const entrega = e.entregada
    ? { estado: "entregada", historial: [{ estado: "entregada", fecha: ahora, por: vendedor.uid, porNombre: vendedor.nombre || "" }] }
    : { estado: "pendiente", historial: [] };

  const venta = { id: idNuevo("venta-dir", ahora), datos: {
    fechaMs, origen: "directa", llaveCodigo: "",
    comprador: comprador ? { nombre: comprador.datos.nombre, telefono: comprador.datos.telefono } : { nombre: "Venta directa", telefono: "" },
    compradorId: comprador ? comprador.id : "",
    vendedorUid: vendedor.uid, vendedorNombre: vendedor.nombre || "",
    items, totales: { UYU: moneda === "UYU" ? total : 0, USD: moneda === "USD" ? total : 0 },
    pago: { registros }, entrega } };
  return { comprador, productosNuevos, descuentos, venta, total };
}
