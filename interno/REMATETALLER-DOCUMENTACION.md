# REMATE TALLER — Documentación del sistema

**Edición del 7 de agosto de 2026 · v0.5.5**

Documento único del proyecto: el reglamento técnico, la historia de cada tanda y la
guía de la parte pública, todo en un archivo. **Reemplaza a
`Master_Briefing_remateTaller_v0_5_1.md`**, que queda archivado como referencia
histórica; ante cualquier contradicción, vale este.

Metodología heredada del desarrollo de Casa Verde Canas, incluida la lección que la
originó: **un documento que vive solo en una conversación se pierde con la
conversación**. Este vive en el repositorio y en el conocimiento del proyecto.

---

## Por dónde empezar, según lo que haya que hacer

| Si vas a… | Andá a |
|---|---|
| **tocar un proceso** (inventario, llaves, pedido, validación, cobro, entrega) | **Libro 1 · §10 · FLUJOS** — qué lo dispara, qué crea y sobre todo **qué NO hace** |
| escribir o corregir código | **Libro 1 · §3** — reglas de código · **§8** — trampas conocidas |
| entender una colección de datos | **Libro 1 · §4** — modelo de datos |
| tocar permisos | **Libro 1 · §5** — el criterio de las reglas de Firestore |
| subir algo, o saber dónde vive cada archivo | **Libro 1 · §2** — infraestructura y estructura del repositorio |
| saber por qué algo está como está | **Libro 2** — el registro de tandas, de la más nueva a la más vieja |
| tocar el `index.html` público, la llave del comprador o el catálogo | **Libro 3** |
| poner el sistema en marcha o verificar que lo está | **Libro 1 · §11** — verificaciones pendientes |

## Las tres partes

- **Libro 1 · CONVENCIONES** — el reglamento técnico. Lo que hay que respetar al
  escribir. Es el único que se lee entero alguna vez.
- **Libro 2 · MASTER BRIEFING** — qué se hizo y por qué, tanda por tanda. Se consulta,
  no se lee: la parte útil está arriba de todo.
- **Libro 3 · GUÍA DEL ACCESO PÚBLICO** — la puerta de la llave, el catálogo del
  comprador, los textos editables y el circuito de WhatsApp.

> **Este documento es público.** GitHub Pages sirve los `.md` del repositorio en texto
> plano a cualquiera que sepa la dirección. Acá no va ninguna clave que no sea ya
> pública por diseño (§2), pero **sí van los mails y los `uid` de los dos
> administradores** — que de todos modos ya están en `interno/utils.js`, en el mapa
> `ADMINS_INICIALES`, servido públicamente desde antes que este archivo. Documentarlos
> no agrega exposición; lo que hay que saber es que están expuestos. Contraseñas y
> `api_secret` de Cloudinary no entran acá ni al repositorio, nunca.

---
---

# LIBRO 1 · CONVENCIONES

### Reglamento técnico único · v1.3 (agosto 2026, tanda 12)

> Este documento manda sobre el código. Si algo acá contradice a una implementación,
> **la implementación está mal**. Si una decisión nueva contradice a este documento,
> primero se actualiza el documento y después se escribe el código.
>
> **Por qué nace la v1.0.** Hasta hoy el proyecto tenía un solo archivo, el Master
> Briefing, que mezclaba tres cosas distintas: las reglas que no cambian, el estado
> actual y la historia. Funcionó ocho tandas porque el sistema es chico. Lo que dejó de
> funcionar fue la verificación: el briefing decía que las reglas de Firestore v0.3
> estaban publicadas cuando seguían las v0.2, y con eso el comprador no podía ver el
> catálogo **sin que nada en la interfaz lo dijera**. Un reglamento separado obliga a
> escribir la regla ("una colección nueva entra con su regla, en la misma tanda") en
> lugar de repetir el síntoma tanda tras tanda.

---

## 1. PRINCIPIOS

1. **Una sola fuente para cada cosa.** Ningún dato vive en dos lugares. Ninguna función
   se escribe dos veces: si dos páginas la necesitan, va a `utils.js`.
2. **Los derivados no se guardan.** El estado de pago de una venta **no existe como
   campo**: se calcula al leer, comparando `pago.registros` contra `totales`, moneda por
   moneda. Guardar un derivado es crear una mentira con fecha de vencimiento — y en un
   sistema donde uno cobra y otro entrega, la mentira aparece justo cuando importa.
3. **Cada moneda es un sistema aparte.** UYU y USD **nunca se suman entre sí**, en
   ningún total, saldo ni KPI. No hay conversión ni pivote: la plata se guarda como es.
   Un producto vive en su moneda; los totales van separados siempre.
4. **La venta es un snapshot inmutable.** Al validar, los ítems y los precios quedan
   congelados. El pedido se edita hasta ese momento; después, lo único que cambia de una
   venta es **pago** y **entrega**.
5. **Trazabilidad de todo acto humano.** Quien registra un pago o cambia un estado de
   entrega queda escrito, con nombre y fecha. El sistema existe para que uno pueda
   cobrar y otro entregar sin perder el hilo: sin el "quién", no sirve.
6. **Simple gana.** Ante dos diseños que resuelven lo mismo, va el que tiene menos
   piezas. Se prefiere repetir un patrón conocido (`metodosPago` copia el patrón de
   `categorias`) antes que inventar uno nuevo.
7. **Decisión antes que código.** Las decisiones estructurales se discuten y se cierran
   con el administrador antes de escribir la primera línea. Y Claude avisa —sin que se
   le pregunte— cuando una estructura se volvió confusa y conviene simplificarla.
8. **Todo se prueba en el teléfono.** El administrador trabaja **solo desde móviles**:
   GitHub web, consola de Firebase, la propia interfaz. Si no se puede hacer desde el
   teléfono, no está terminado.
9. **Retrocompatibilidad de datos.** El depósito ya tiene productos cargados. Cambiar la
   forma de un documento nunca puede dejar invisible lo viejo (§3.6).

---

## 2. INFRAESTRUCTURA

| Pieza | Valor |
|---|---|
| Proyecto Firebase | **`remate-acbc9`** (Firestore + Auth email/contraseña) |
| SDK | Firebase **10.12.0 ESM** vía CDN. Sin build, sin frameworks, sin `package.json` |
| Frontend | Vanilla HTML/JS/CSS, módulos ES, template literals, `?.` |
| Repositorio y despliegue | **GitHub Pages**, `github.com/rematetaller`. Lo que se sube queda en vivo, sin etapa intermedia |
| URL | **`https://rematetaller.github.io/remate/`** — usuario `rematetaller`, repo `remate`. Dominio propio: pendiente (§12.2) |
| PWA | `interno/manifest.webmanifest` + `interno/sw.js`. **El panel se instala; la parte pública no** (§3.17) |
| Marca | Fondo `#b45309` (--c-primario), trazo `#fef3e2` (--c-primario-claro). En la topbar, el ícono `gavel` de Material Icons |
| Fotos | Cloudinary cloud **`r9u5oous`**, preset unsigned **`preset-remate`** ✅ creado y verificado, carpeta `remate/productos` |
| Compresión de imágenes | JPEG 0.85 client-side · **productos: máx 800px** · otros usos: máx 2000px |
| Funciones de servidor | **ninguna todavía.** Las notificaciones (EmailJS + CallMeBot) son el próximo pendiente y van por Netlify (§12) |
| Dispositivos | Mobile-first, teléfono Android/iPhone. El escritorio es el caso raro |
| Idioma | Rioplatense, voseo — en la interfaz y en la documentación |

**Config Firebase (pública por diseño):** projectId `remate-acbc9`, apiKey
`AIzaSyB2ZT8nLzhcejyqdOA1Ipuwaipm3KTAaRU`, authDomain `remate-acbc9.firebaseapp.com`,
messagingSenderId `815214584678`, appId `1:815214584678:web:3fd234a6e92eed932e5ea7`.

**Qué es público y qué no.** La apiKey de Firebase y el cloud/preset de Cloudinary son
públicos por diseño: no son secretos, son identificadores. Lo que protege el sistema son
las reglas de Firestore (§5), que las aplica el servidor. **Nunca salen del lado
servidor ni entran al repositorio:** el `api_secret` de Cloudinary, las contraseñas de
los administradores (que además **no se comparten entre ellos**) y las futuras claves de
terceros, que irán en variables de entorno de Netlify.

### 2.1 · Estructura del repositorio

```
/index.html                  → LA PUERTA PÚBLICA: valida la llave, o avisa por WhatsApp
/comprador.html              → el catálogo y el carrito del comprador (entra con llave)
/firestore.rules             → copia de las reglas publicadas en la consola
/interno/                    → el panel de los dos administradores
   utils.js                  → el núcleo. Firebase, auth, nav, llaves, fotos, ayuda, helpers
   design-system.css         → estilos comunes, mobile-first
   login.html                → login admin
   index.html                → router/portero del panel
   panel.html                → dashboard con KPIs y la tarjeta "El circuito completo"
   inventario.html           → categorías y productos
   llaves.html               → generar llaves y ver el historial de cada comprador
   pedidos.html              → revisar, editar, validar o descartar
   ventas.html               → post-venta: pagos, entrega, detalle de artículo
   configuracion.html        → textos públicos y gestión de usuarios
   manifest.webmanifest      → PWA del panel (nombre, colores, iconos)
   sw.js                     → service worker: instalación + caché network-first
   icons/                    → icon.svg (fuente) + los 7 PNG/WEBP derivados
   REMATETALLER-DOCUMENTACION.md   → este archivo
```

**Las dos páginas de la raíz no tienen manifest ni service worker, y es a propósito**
(§3.17). Sí les corresponden los links de favicon y el `theme-color` — hoy **no los
tienen** (§12.3).

**Las dos páginas de la raíz son públicas y cargan del panel solo lo compartido:**
`interno/design-system.css` por `<link>` e `interno/utils.js` por `import
'./interno/utils.js'`. No importan nada más de `interno/`.

**Hay UN solo documento en el repositorio.** Al subir una edición nueva se reemplaza la
anterior. Dos documentos casi iguales conviviendo garantizan que alguien —persona o
asistente— lea el viejo y trabaje sobre un estado que ya no existe.

---

## 3. REGLAS DE CÓDIGO

Cada una nació de un problema real. Se rompen bajo propio riesgo.

### 3.1 · Archivos completos, nunca diffs
Toda modificación se entrega como **archivo completo listo para subir sustituyendo al
anterior**. El administrador trabaja desde el teléfono, con GitHub web: aplicar un parche
a mano en una pantalla de 6 pulgadas es cómo se rompe un archivo que funcionaba.

### 3.2 · El núcleo es `utils.js` y no se duplica
Firebase (una sola instancia, un solo import de CDN), autenticación con
autoprovisionamiento, navegación, `validarLlave`, `subirFoto`, el visor `mostrarFoto`, la
ayuda `iniciarAyuda`/`mostrarAyuda`, formatos y helpers viven ahí. Si una función se
necesita en dos páginas, sube al núcleo en la misma tanda; no se copia.

### 3.3 · IDs determinísticos para todo lo que genera el sistema
`pedidos/ped-<codigo>` y `ventas/venta-ped-<codigo>`. Con eso, validar dos veces el mismo
pedido no crea dos ventas: sobrescribe la misma. La idempotencia no es elegancia, es la
única defensa contra el doble toque en un teléfono con mala señal.

### 3.4 · Nunca pisar lo que el otro escribió
Al re-validar un pedido, `pago` y `entrega` existentes **se preservan**. Al inicializar
esos campos, se inicializan solo si faltan. La regla general: una escritura del sistema
no borra el trabajo de una persona.

### 3.5 · El estado que se puede calcular, se calcula
El estado de pago se deriva del saldo por moneda (Sin pagar / Pago parcial / Pagada); el
estado disponible/agotado de un producto se deriva del stock. Ninguno de los dos se
guarda como campo.

### 3.6 · Retrocompatibilidad al cambiar la forma de un documento
Los productos anteriores a la v0.4 tienen solo `descripcion`, sin `nombre`. Toda la
interfaz resuelve el nombre con **`nombreDe(p) = p.nombre || p.descripcion`**, y editar
un producto viejo lo migra al formato nuevo. Corolario doloroso: **no se usa `orderBy`
server-side por `nombre` ni por `descripcion`** — Firestore excluye del resultado los
documentos que no tienen el campo, así que ordenar por `nombre` **hace desaparecer todo
el inventario viejo, sin error**. Los listados de productos se ordenan client-side con
`nombreDe(p)`.

### 3.7 · Las fechas dentro de arrays van en milisegundos
`serverTimestamp()` **no funciona dentro de un array**. Los registros de pago y el
historial de entrega usan `Date.now()` en ms, compatibles con los helpers `tsAms` y
`fmtFecha`. Fuera de arrays, `serverTimestamp()` como siempre.

### 3.8 · Todo total lleva la moneda en la clave
No hay un solo lugar del sistema donde se sume plata sin agrupar por moneda: totales del
carrito, totales de la venta, saldo por cobrar, KPIs. Un total que mezcla UYU y USD miente
y no avisa.

### 3.9 · Toda imagen entra por `subirFoto`
Ninguna página arma su propia llamada a Cloudinary. `subirFoto(archivo, maxLado)`
comprime, sube y devuelve la URL — con `maxLado` 800 para productos y 2000 por defecto.
Se guarda siempre la copia propia en Cloudinary, nunca una URL ajena.

### 3.10 · Los errores muestran la causa, no el código HTTP
Un "Error 400" no se puede diagnosticar; "Upload preset not found" se resuelve en un
minuto. `subirFoto` **devuelve al toast el mensaje que manda Cloudinary**. Esta regla
existe porque resolvió, sola, el problema que había bloqueado la carga de fotos.

### 3.11 · Toda página interna llama `iniciarAyuda`
`iniciarAyuda(titulo, html)` inyecta el "?" junto al `<h1>` y abre el panel que explica
los estados y las acciones **de esa sección**. Estilos y modal se autoinyectan desde
`utils.js`: no se toca `design-system.css` para esto. En `panel.html` se llama **después**
de setear el saludo, porque el saludo reemplaza el contenido del `h1` y se lleva el "?"
con él.

### 3.12 · Lo clicable dentro de un `<summary>` frena el toggle
Un elemento interactivo (la foto de un producto en su tarjeta colapsada) necesita
`e.preventDefault()` **y** `e.stopPropagation()`. Sin los dos, tocar la foto abre o cierra
la tarjeta en vez de ampliar la imagen.

### 3.13 · El visor de fotos es uno solo
`mostrarFoto(urls, indice)`: overlay a pantalla completa, navegación ‹ › y contador
cuando hay varias, cierra con × o tocando el fondo. Lo usan inventario, el catálogo del
comprador y el detalle de artículo en ventas. Nada abre una pestaña nueva para mostrar
una imagen.

### 3.14 · Material Icons antes de `design-system.css`
Todo HTML incluye el `<link>` de Material Icons en el `<head>`, **antes** de
`design-system.css`. Falta un solo `<link>` y la página aparece con los nombres de los
íconos escritos en texto.

### 3.15 · Sintaxis validada antes de entregar
Antes de dar un archivo por entregado se valida que el JS parsea. Un error de sintaxis en
un módulo ES no rompe una función: **deja la página en blanco**, sin nada visible que
explique por qué.

### 3.19 · La salida vive en la hoja de cuenta, no en la navegación
El avatar de la topbar abre la hoja de cuenta: quién sos, **Cerrar sesión** y **Reparar la
app**. No se pone "Salir" como ítem de la barra de navegación: la barra scrollea horizontal
y en un teléfono entran cinco ítems, así que el último es un botón invisible — que es
exactamente lo que pasó hasta la tanda 12. Y `cerrarSesion` **limpia la caché local**
(`terminate` + `clearIndexedDbPersistence`): la caché de Firestore es una por navegador, y
sin limpiarla la próxima persona que entre en ese teléfono abre el panel con los datos de
la anterior. El `Promise.race` de 3 segundos existe para que un IndexedDB trancado no deje
a nadie encerrado adentro.

### 3.20 · Reparar la app no toca el servidor
`repararApp()` borra service workers, todas las cachés y las bases locales de Firebase.
Nada más. Existe porque dentro de una PWA instalada no hay consola ni forma cómoda de
borrar los datos del sitio, y el síntoma —una pantalla que sirve una mezcla vieja— no se
distingue de un bug. El texto de confirmación dice explícitamente que no se pierde ningún
dato: sin eso, nadie se anima a tocarlo.

### 3.17 · La PWA es del panel, no del sitio público
`manifest.webmanifest` y `sw.js` viven en `interno/` y los registran **solo** las páginas
de ahí, con ruta relativa: el alcance del service worker queda en `/interno/` y **nunca
toca el catálogo del comprador**. Es la decisión correcta por dos motivos: al comprador,
que entra una vez con una llave que vence, ofrecerle "instalar la app" no le sirve; y un
catálogo cacheado es un catálogo que muestra stock que ya no existe. Las páginas públicas
llevan favicon y `theme-color`, nada más.

### 3.18 · Los iconos salen de `icon.svg`
`interno/icons/icon.svg` es la fuente de verdad del dibujo; los siete archivos derivados
(`icon-512`, `icon-192`, `icon-maskable-512`, `apple-touch-icon`, `favicon-32`,
`favicon-16`, `favicon.webp`) se regeneran desde ahí. Tres detalles que no son opcionales:
el **maskable va a sangre**, sin esquinas redondeadas propias (las pone el sistema
operativo; si las trae el archivo, con máscara cuadrada quedan esquinas transparentes) y
con el dibujo dentro del círculo seguro del 80%; los **favicon de 16 y 32 usan una
variante simplificada**, sin el hueco de la boca de la llave, que a ese tamaño se empasta;
y los colores son los del design-system, no unos propios.

### 3.16 · Los archivos llevan versión visible
Cada archivo tiene su número de versión, y el inventario de §6 dice cuál es. Así se puede
verificar desde el teléfono si lo que está subido es lo que el registro dice que está
subido. **Hoy se cumple a medias:** solo `utils.js` y `design-system.css` llevan la
versión escrita adentro; en las páginas HTML la versión vive únicamente en el inventario,
que es justo donde menos sirve para verificar (§12.8).

---

## 4. MODELO DE DATOS

```
usuarios/{uid}       → { nombre, email, rol:'admin', activo, creadoEn }
config/publico       → { nombreContacto, telefonoWhatsapp, mensajeBienvenida,
                         mensajeVencido, mensajeSinLlave, mensajePrecargado,
                         actualizadoEn, actualizadoPor }
categorias/{id}      → { nombre, activa, creadaEn }
metodosPago/{id}     → { nombre, activa, creadoEn, creadoPor }
                       // solo los métodos custom. "Efectivo" y "Transferencia" son
                       // base hardcodeada en ventas.html
productos/{id}       → { nombre, descripcion, categoriaId, cantidad, ubicacion,
                         moneda:'UYU'|'USD', precioSugerido, precioLote|null,
                         fotos:[urls], estado:'disponible'|'agotado',
                         creadoEn, actualizadoEn }
llaves/{codigo}      → { nombre, telefono, categorias:[ids] (vacío = todas),
                         creadaEn, venceEn (Timestamp), revocada, creadaPor }
pedidos/ped-{codigo} → { llaveCodigo, nombre, telefono,
                         items:[{ productoId, descripcion (= nombre del producto),
                                  moneda, precioUnit, cantidad, esLote, precioLote,
                                  propuestaLote, subtotal, precioFinal (admin) }],
                         estado:'abierto'|'enviado'|'validado'|'descartado',
                         gestionadoPor, actualizadoEn }
ventas/venta-ped-{codigo}
                     → { fecha, llaveCodigo, comprador:{nombre,telefono},
                         vendedorUid, vendedorNombre,
                         items:[{ productoId, descripcion, cantidad, esLote,
                                  moneda, precioFinal }],
                         totales:{ UYU, USD },
                         pago:{ registros:[{ fecha(ms), monto, moneda, metodo,
                                nota, registradoPor, registradoNombre }] },
                         entrega:{ estado:'pendiente'|'preparada'|'entregada',
                                   historial:[{ estado, fecha(ms), por, porNombre }] } }
```

### Notas de cada colección

**`usuarios/{uid}`** — el id del documento **es el `uid` de Auth**. Para sumar una
persona: crearla en Auth desde la consola de Firebase, copiar su UID y darle de alta la
ficha desde **"Agregar usuario"** en `configuracion.html` (email + nombre + UID; queda con
`rol: 'admin'` y `activo: true`). Las contraseñas no se comparten nunca: la persona entra
por **"Recuperar contraseña"** en `login.html`, que manda el mail de Firebase. Desde
`configuracion.html` se edita el nombre y se activa/desactiva, y **nadie puede
desactivarse a sí mismo** — desde la v0.4 eso lo impide la regla, no la pantalla.
`utils.js` todavía tiene el mapa **`ADMINS_INICIALES`** con la autoprovisión del primer
login, que **la v0.4 dejó sin efecto a propósito** (§5.7). El campo `rol` se escribe
siempre como `'admin'` y hasta la v0.4 nadie lo leía; ahora lo lee la regla.

- Florencia — florenciadetp@gmail.com — `6HnSCkjKGEWKv39f37HJRpLEToV2`
- Mauro — masotromauro@gmail.com — `R9b8YLM66mdrY8FTC8gEjBNaOr92`

Florencia es la gestora principal de la base y del control de ventas.

**`productos/{id}`** — `nombre` es corto y es lo que se ve en todo el sistema;
`descripcion` es el detalle libre y es opcional. `precioLote` es el precio especial por
el stock completo, y es opcional: sin él, el botón "Lote completo" no ofrece precio de
lote pero sí permite proponer uno. `ubicacion` es dónde está en el depósito, y su único
lector real es el detalle de artículo de ventas, para armar el paquete.

**`llaves/{codigo}`** — código de 8 caracteres sin ambiguos. `categorias` vacío significa
**todas**. `venceEn` es un `Timestamp` de Firestore, no ms: la regla de Firestore lo
compara contra `request.time` (§5).

**`pedidos/ped-{codigo}`** — **un pedido por llave.** Si el pedido se validó o se
descartó y el comprador quiere volver a comprar, **se genera una llave nueva**: no es una
limitación técnica, es la decisión que mantiene un pedido por acuerdo.

**`ventas/venta-ped-{codigo}`** — snapshot. `items` y `totales` no se editan nunca. Los
únicos campos que cambian después son `pago` y `entrega`.

---

## 5. SEGURIDAD

### 5.1 · El criterio
Tres círculos, de afuera hacia adentro:

1. **Lectura pública sin sesión:** el catálogo (`productos`, `categorias`), los textos de
   `config/publico` y el `get` puntual de una llave por su código. **Decisión de la
   v0.3:** el catálogo es de lectura pública y el filtrado por categorías de la llave se
   hace en la interfaz. Los datos no son sensibles —son restos de mercadería sin
   documentación— y la alternativa (filtrar server-side por llave) multiplicaba la
   complejidad de las reglas sin proteger nada que importe.
2. **Escritura con llave vigente, validada en el servidor:** solo `pedidos`, y solo
   mientras el pedido esté `abierto` o `enviado`. Un comprador **no puede escribir sobre
   un pedido ya validado**: eso lo garantiza la regla, no la interfaz.
3. **Todo lo demás, solo usuarios activos.** `usuarios`, `ventas`, `metodosPago`,
   `llaves` (listar), borrados. **Autenticado no alcanza**: la regla exige que exista la
   ficha en `usuarios/{uid}` y que `activo == true` (§5.6).

**Nunca se puede listar `llaves` sin sesión.** El `get` por código está abierto porque el
código *es* la credencial; poder listarlas sería entregar todas las credenciales.

### 5.2 · Las reglas se editan completas, nunca por fragmentos
Reemplazar el archivo por unos pocos bloques **deniega todo lo demás**. Se pega siempre
el archivo entero.

### 5.3 · Una colección nueva entra con su regla, en la misma tanda
**Desde la v0.4 no hay catch-all: rige el default deny.** Una colección sin bloque propio
queda inaccesible desde el cliente y falla a la vista, en la primera prueba. Antes era peor:
el catch-all la dejaba abierta a cualquiera con sesión y el problema aparecía mucho después.
El bloque se escribe en la misma entrega que el código que usa la colección.

### 5.4 · Reglas vigentes (v0.4) — pegar completas en la consola

> Las **v0.3 quedaron verificadas**: estaban publicadas de verdad (§11.1 cerrada). La v0.4
> se apoya en eso y cierra dos cosas que la v0.3 dejaba abiertas.

El archivo completo vive en `firestore.rules`, en la raíz del repositorio, y es la copia de
lo que hay que pegar en la consola. Lo que cambia respecto de la v0.3:

1. **Se eliminó el catch-all `match /{col}/{docId}`.** Rige el default deny (§5.3).
   Consecuencia inmediata: `metodosPago` necesitó su bloque propio, porque vivía del
   catch-all sin que nadie lo hubiera notado.
2. **`usuarios` dejó de ser escribible por cualquier autenticado.** Era el agujero grande:
   con el rol viviendo en ese documento, cualquiera con sesión podía editarse el suyo y
   ponerse `rol: 'admin'`. Ahora escribir usuarios es solo de admin, y **nadie puede
   desactivarse a sí mismo ni cambiarse el rol** — eso pasó de ser un cuidado de la
   interfaz a ser una regla.
3. **Toda escritura de administración exige usuario activo**, no solo autenticado.

### 5.6 · Autenticado no es lo mismo que habilitado
La v0.3 autorizaba con `request.auth != null` y nada más. Eso significaba que desactivar a
alguien le cortaba el panel pero **no los datos**: con su credencial viva podía leer y
escribir Firestore por fuera de la interfaz. Las funciones `activo()` y `esAdmin()` leen la
ficha de `usuarios/{uid}` y exigen `activo == true`. Cada `get()` en una regla cuesta una
lectura facturada y hay un tope de 10 accesos por evaluación: a este volumen es
irrelevante, y el día que exista una función de servidor conviene mover el rol a **custom
claims**, que viajan en el token y no cuestan lecturas (a cambio de tardar hasta una hora
en propagarse).

### 5.7 · La autoprovisión de administradores ya no funciona, y está bien
Hasta la v1.5, `verificarAuth` creaba el documento de usuario en el primer login si el
`uid` estaba en `ADMINS_INICIALES`. **Esa escritura la deniega la regla**, y tiene que ser
así: si el cliente pudiera crear su propia ficha, el agujero del punto 2 volvería por la
ventana. Los dos administradores actuales ya tienen su documento, así que no se rompe nada
hoy — pero el camino para sumar una persona es el que ya existe en `configuracion.html`:
crearla en Auth desde la consola y darle de alta la ficha con su UID desde el panel. **La
v1.6 retiró el bloque** y lo reemplazó por un cartel que explica la situación y muestra el
UID para copiarlo.

### 5.5 · Cuando lleguen las integraciones, salen del catch-all
Hoy `config/` tiene un solo documento, `publico`, con su bloque propio. **El día que
exista un `config/integraciones` con claves de terceros, se le escribe su regla y se lo
excluye del catch-all** — el catch-all lo dejaría legible para cualquier usuario
autenticado. Lección directa de Casa Verde.

---

## 6. INVENTARIO DE ARCHIVOS

Se actualiza en **toda** tanda que cree, borre o cambie un archivo. Un inventario
desactualizado es peor que no tenerlo: da por existente lo que no está.

| Archivo | v | Qué es |
|---|---|---|
| `index.html` | 1.0 | Puerta pública: valida la llave (por link o a mano) y avisa por WhatsApp si no sirve |
| `firestore.rules` | 0.4 | Copia de las reglas de la consola: default deny, `usuarios` cerrado, chequeo de `activo` |
| `comprador.html` | 2.3 | Catálogo (nombre + descripción, fotos ampliables), guía "¿Cómo comprar?", carrito, lote, propuesta, envío |
| `interno/utils.js` | 1.6 | Núcleo: Firebase, auth (sin autoprovisión), **hoja de cuenta / salida limpia / reparar app**, nav, `validarLlave`, `subirFoto`, ayuda, visor `mostrarFoto`, `escapar`, helpers |
| `interno/design-system.css` | 1.0 | Estilos mobile-first |
| `interno/login.html` | 1.0 | Login admin |
| `interno/index.html` | 1.0 | Router/portero del panel |
| `interno/panel.html` | 1.1 | Dashboard con KPIs, tarjeta "El circuito completo", ayuda con la visión general |
| `interno/inventario.html` | 1.5 | Form desplegable, nombre + descripción, tarjetas colapsadas con Editar / Historial / Eliminar, borrado de categorías vacías, ayuda |
| `interno/llaves.html` | 1.2 | Crear y compartir llaves + historial de compras por comprador + ayuda |
| `interno/pedidos.html` | 1.2 | Revisar / editar / validar / descartar; al validar inicializa `pago` y `entrega` sin pisar lo existente; ayuda |
| `interno/ventas.html` | 2.2 | Post-venta completo: pagos parciales, `metodosPago`, entrega con historial, detalle de artículo, filtros, KPI Por cobrar, ayuda |
| `interno/configuracion.html` | 1.2 | Contacto y textos públicos + gestión de usuarios + ayuda |
| `interno/manifest.webmanifest` | 1.0 | PWA del panel: nombre, `start_url` `index.html`, `display: standalone`, colores `#f4f4f2` / `#b45309`, tres iconos (192, 512, maskable 512) |
| `interno/sw.js` | 1.1 | Service worker: `skipWaiting`, limpieza de cachés viejos, y **network-first** con caída al caché solo para GET del mismo origen (Firebase y CDN siempre van a la red) |
| `interno/icons/icon.svg` | 2.0 | Fuente de verdad del icono |
| `interno/icons/*.png` `.webp` | 2.0 | `icon-512`, `icon-192`, `icon-maskable-512`, `apple-touch-icon` (180), `favicon-32`, `favicon-16`, `favicon.webp` (16) |
| `interno/REMATETALLER-DOCUMENTACION.md` | — | Este archivo |

Las ocho páginas de `interno/` incluyen, además del `<link>` de Material Icons: el
`<link rel="manifest">`, el `<meta name="theme-color" content="#b45309">`, los tres links
de icono y el registro del service worker al final del `<body>`.

**Ningún archivo del repositorio queda sin que alguien lo referencie.** Un archivo
huérfano "por si acaso" es el que después alguien abre creyendo que está en uso.

---

## 7. INTERFAZ

### 7.1 · El teléfono manda
Se diseña para una pantalla de teléfono y se prueba ahí. No se diseña pensando primero en
el escritorio: el escritorio es el caso raro de este sistema.

### 7.2 · Colapsado por defecto
El inventario puede tener cientos de productos. Las tarjetas nacen **colapsadas** y los
formularios largos viven detrás de un botón ("Agregar nuevo producto"). Se abre lo que se
va a usar; el resto no ocupa pantalla.

### 7.3 · Los totales van en barra fija
El total del carrito —separado por moneda— vive fijo abajo mientras el comprador recorre
el catálogo. Es el dato que decide la compra: no puede quedar arriba, fuera de vista.

### 7.4 · Cada pantalla explica sus propios estados
El "?" de cada página interna explica **los estados y las acciones de esa sección**, no el
sistema entero. El sistema entero se explica una vez, en el "?" del panel. El objetivo
declarado de la ayuda es evitar errores de registro cuando dos personas se reparten el
trabajo.

### 7.5 · Los pasos se limitan a lo posible
El stepper de cantidad no pasa del stock. El catálogo del comprador solo muestra stock
> 0. Un botón que permite pedir lo que no hay obliga a un rechazo después.

### 7.6 · La marca es una sola
Un martillo de rematador cuyo mango es una llave mecánica, en `#fef3e2` sobre `#b45309`:
el remate y el taller en un solo dibujo. En la topbar de las páginas internas la marca se
resuelve con el ícono `gavel` de Material Icons, que ya viene cargado; el dibujo propio
(§3.18) es para el favicon y el icono de la app instalada.

### 7.7 · Nada de estilos inyectados desde una página
El CSS vive en `design-system.css`. La única excepción son los estilos que **`utils.js`**
autoinyecta para sus componentes globales (ayuda y visor de fotos), porque son parte del
núcleo y no de una página.

---

## 8. FLUJO DE TRABAJO (tandas)

1. Una **tanda** = uno o más archivos completos + la actualización de este documento
   (inventario + registro del Libro 2). **No se mezclan asuntos entre tandas**: las
   tandas agrupadas existen para poder probar una cosa a la vez.
2. **Siempre archivos completos** (§3.1).
3. Al entregar se dice: qué archivo es nuevo, cuál reemplaza, y **qué acción manual**
   queda pendiente (republicar reglas, crear un índice, cargar un dato en la consola).
4. **La documentación se sube en la misma tanda que el código que describe.** Un
   documento actualizado una tanda después es un documento que estuvo mintiendo una
   tanda.
5. **No se registra como entregado nada que no se haya entregado en la misma tanda.** Y
   al leer un registro viejo: **lo que dice "listo" no está probado que lo esté**. En este
   proyecto ya pasó dos veces —las reglas v0.3 "publicadas" y el preset de Cloudinary—:
   un registro es la intención de quien lo escribió, la verificación es abrir la consola.
6. **Cuando cambia un flujo se revisan todas las pantallas y textos que lo mencionan.**
   La línea *"Dónde se muestra"* de cada flujo en §10 es esa lista, y ahora incluye los
   textos de la ayuda contextual: **cambiar un estado sin cambiar su "?" deja una
   explicación falsa dentro del propio sistema.**
7. Antes de entregar: sintaxis validada (§3.15).
8. **Cómo se retira una función:** primero se saca de la interfaz y se verifica que nada
   la llame; después se borra el código; recién al final, si tenía datos propios, se
   borran los datos y se cierra su regla. Nunca al revés.

---

## 9. TRAMPAS CONOCIDAS Y LO QUE NO SE HACE

### 9.1 · Trampas conocidas

- **Las reglas publicadas no son las reglas escritas.** El síntoma es cruel: el panel
  funciona perfecto (está autenticado) y el comprador no ve nada. Antes de buscar el bug
  en el código del comprador, **abrir la consola de Firestore y leer lo que dice ahí**.
- **`orderBy` por un campo que no todos los documentos tienen los excluye del
  resultado**, sin error. Ordenar el inventario por `nombre` esconde todos los productos
  anteriores a la v0.4 (§3.6).
- **`serverTimestamp()` dentro de un array no guarda nada útil.** Las fechas de registros
  de pago e historial de entrega van en ms (§3.7).
- **Un código HTTP de un servicio de terceros no es un diagnóstico.** El "400" de
  Cloudinary tapó durante toda una tanda un preset que no existía (§3.10).
- **El `<summary>` se come el toque de lo que tiene adentro** (§3.12).
- **`iniciarAyuda` antes de escribir el saludo del panel:** el "?" desaparece porque el
  saludo reemplaza el contenido del `h1` (§3.11).
- **`orderBy` sin índice:** `pedidos.html` ordena por `actualizadoEn`. Si aparece el error
  en la consola del navegador, Firestore da el link para crear el índice con un toque
  (§11.4).
- **Un pedido descartado no se puede reabrir.** Hoy la única salida es generar una llave
  nueva. Es una decisión, no un olvido — pero si retomar negociaciones se vuelve
  frecuente, ver §12.6.
- **Validar dos veces está previsto, borrar no.** La validación es idempotente y preserva
  pago y entrega, pero **descuenta el stock**: revalidar un pedido cuyos ítems se editaron
  entre medio no reconcilia el stock ya descontado. Si hay que corregir cantidades después
  de validar, se corrige el stock a mano en inventario.
- **Autenticado no es habilitado** (§5.6), y **el documento que guarda el permiso hay que
  protegerlo antes que nada**: si el rol vive en `usuarios/{uid}` y ese documento es
  escribible por su dueño, el esquema de roles no existe.
- **Al sacar el catch-all aparecen las colecciones que vivían de él.** `metodosPago` era
  una: nunca tuvo bloque propio. La prueba de que las reglas nuevas están bien no es que el
  panel abra, es que **cada colección se siga usando**.
- **Un `catch` que se traga un error de permisos es un error invisible.** Si algo "no
  carga" y la consola está limpia, sospechar de un `catch` silencioso antes que de la
  lógica.

### 9.2 · Lo que no se hace

- No se guarda un derivado (estado de pago, estado de stock).
- No se suman monedas distintas en un mismo total.
- No se toca `items` ni `totales` de una venta ya validada.
- No se escribe encima del pago o la entrega que registró otra persona.
- No se ordena server-side por un campo que puede faltar.
- No se pone `serverTimestamp()` dentro de un array.
- No se llama a Cloudinary ni se arma un `<input type="file">` fuera de `utils.js`.
- No se guarda la URL de una imagen ajena: siempre la copia propia.
- No se edita `firestore.rules` por fragmentos: siempre completo.
- No se agrega una colección sin su regla en la misma tanda.
- No se deja un documento de `config/` con claves de terceros bajo el catch-all.
- No se comparten contraseñas, ni entran al repositorio, ni a este documento.
- No se entregan diffs: archivos completos.
- No se inyectan estilos desde una página (salvo los globales del núcleo).
- No se muestra en el catálogo del comprador un producto sin stock.
- No se deja una página interna sin su `iniciarAyuda`.
- No se cambia un estado sin actualizar el texto de la ayuda que lo explica.
- No se deja en el repositorio un archivo que nadie referencia.
- No conviven dos versiones de este documento en el repositorio.
- No se implementa una decisión estructural sin cerrarla antes con el administrador.
- No se declara entregado lo que no se entregó, ni se da por hecho lo que un registro
  viejo dice que está hecho.

---

## 10. FLUJOS

Un flujo cuenta **cómo se comporta el sistema de punta a punta**. No es el dato en reposo
(§4), ni la historia de cómo llegamos (Libro 2), ni cómo se usa una pantalla (la ayuda
contextual de cada página). Es la capa que explica el circuito.

**Cada flujo contesta las mismas seis preguntas.** La que más sirve es la última que uno
escribiría: *qué NO hace*.

> **Qué lo dispara** — el hecho concreto, nunca "una fecha"
> **Qué crea** — documentos, con sus IDs
> **Quién lo ve** — alcance y permisos
> **Cómo termina** — la condición de cierre
> **Qué NO hace** — los límites, para cortar suposiciones
> **Dónde se muestra** — las pantallas y los textos de ayuda a revisar cuando cambie

| | Flujo | Empieza en |
|---|---|---|
| **F1** | Del depósito al catálogo | un administrador carga un producto |
| **F2** | La llave: dar acceso a un comprador | un administrador crea la llave y la manda |
| **F3** | El carrito y el pedido | el comprador entra con su llave |
| **F4** | La validación: de pedido a venta | un administrador toca "Valida venta" |
| **F5** | El post-venta: cobro y entrega | existe una venta |
| **F6** | Las fotos: de la cámara al visor | alguien toca "Cámara" o "Galería" |

---

### F1 · Del depósito al catálogo

**Qué lo dispara** — Un administrador, en `inventario.html`. No hay importación masiva:
el depósito se carga a mano, producto por producto, desde el teléfono.

**Qué crea** — `categorias/{id}` y `productos/{id}`. El producto lleva **nombre** (corto,
es lo que se ve en todo el sistema) + **descripción** (opcional, detalle libre),
categoría, cantidad, ubicación en el depósito, moneda, precio unitario, **precio especial
de lote completo** (opcional) y fotos.

**Quién lo ve** — Los dos administradores para escribir. El catálogo es de **lectura
pública** (§5.1); el comprador ve solo las categorías de su llave y solo lo que tiene
stock.

**Cómo termina** — No termina: el inventario es un estado, no un proceso. El estado
`disponible`/`agotado` **se deriva del stock**, no se toca a mano.

**Qué NO hace**
- **No permite borrar una categoría que tenga productos** — se chequea con
  `getCountFromServer` antes de habilitar el borrado.
- **No exige descripción.** Un producto puede ser solo un nombre.
- **No ordena por nombre en el servidor** (§3.6).
- **No reconcilia el stock que descontó una venta.** Si hay que corregirlo, se corrige acá
  a mano.

**Dónde se muestra** — `inventario.html` (lista y formulario) · su "?" · el catálogo de
`comprador.html` · el **Historial** del producto (quién lo compró, leído desde `ventas`).

---

### F2 · La llave: dar acceso a un comprador

**Qué lo dispara** — Un administrador crea la llave en `llaves.html`: nombre + teléfono,
categorías habilitadas (**vacío = todas**) y duración 3 / 7 / 14 / 30 días (default 7).

**Qué crea** — `llaves/{codigo}`, con un código de 8 caracteres sin caracteres ambiguos.
Se comparte por **WhatsApp con mensaje precargado + link** (`URL/?llave=CODIGO`); el
comprador también puede escribir el código a mano en la puerta pública.

**Quién lo ve** — El comprador, con el código. Los administradores, en la lista. **Nadie
sin sesión puede listar las llaves** (§5.1): el código es la credencial.

**Cómo termina** — Se vence (`venceEn`) o se revoca. En los dos casos el comprador ve el
aviso correspondiente con el botón de WhatsApp, y **la regla de Firestore le bloquea la
escritura**, no solo la interfaz.

**Qué NO hace**
- **No registra al comprador.** No hay cuenta, no hay contraseña, no hay recuperación:
  hay una llave.
- **No permite dos pedidos.** Una llave, un pedido (§4). Para volver a comprar, llave
  nueva.
- **No se extiende.** No hay "renovar": se crea otra.

**Dónde se muestra** — `llaves.html` (tarjeta de cada comprador, con su historial de
compras) · su "?" · `index.html` público · los tres textos de `config/publico` (Libro 3).

---

### F3 · El carrito y el pedido

**Qué lo dispara** — El comprador abre el link o mete el código. `index.html` valida la
llave y lo deja pasar a `comprador.html`.

**Qué crea** — `pedidos/ped-<codigo>`, con **autoguardado**: el pedido existe desde el
primer artículo agregado, en estado `abierto`. Cada ítem guarda el **nombre del producto en
`descripcion`** — para que la venta siga siendo legible aunque el producto cambie o se
borre después. Por artículo, el comprador elige **cantidad** (stepper limitado al stock) **o
el lote completo**, y si es lote puede **proponer un precio**.

**Quién lo ve** — El comprador (`get` público del pedido) y los administradores.

**Cómo termina** — El comprador toca **Enviar pedido** → estado `enviado`. **Puede seguir
editando hasta que se valide.** Si entra después de validado, ve la pantalla de compra
confirmada.

**Qué NO hace**
- **No mezcla monedas:** los totales van separados, UYU y USD, en la barra fija.
- **No hay oferta global sobre el pedido.** La propuesta de precio es **por lote de cada
  producto** (§12.3).
- **No convierte monedas.** El comprador ve dos totales, no uno.
- **No descuenta stock.** Nada del stock se mueve hasta F4.
- **No permite escribir sobre un pedido validado o descartado**, ni con llave vigente: lo
  frena la regla.

**Dónde se muestra** — `comprador.html` (catálogo, carrito, barra de totales) · la guía
desplegable **"¿Cómo comprar?"** · `pedidos.html` · su "?".

---

### F4 · La validación: de pedido a venta

**Qué lo dispara** — Un administrador, en `pedidos.html`, sobre un pedido `enviado`
(estado por defecto del listado). Antes puede **editar cantidades y el precio final de
cada renglón**, quitar ítems y guardar. Las propuestas de lote se destacan con badge para
que no pasen de largo.

**Qué crea** — `ventas/venta-ped-<codigo>` (§4), inicializando `pago.registros` vacío y
`entrega.estado = 'pendiente'`. Además: **descuenta el stock** de cada producto —el lote
completo lo deja en 0— y cierra el pedido como `validado`.

**Quién lo ve** — Solo administradores. Ni el pedido ni la venta se validan desde afuera.

**Cómo termina** — Con la venta creada. La alternativa es **descartar** el pedido, que lo
cierra sin crear venta y sin tocar el stock.

**Qué NO hace**
- **No duplica.** El ID es determinístico: revalidar sobrescribe la misma venta y
  **preserva `pago` y `entrega`**.
- **No reconcilia el stock si se revalida** (§9.1).
- **No avisa a nadie.** Hoy no hay notificaciones: el administrador se entera abriendo el
  panel (§12.1).
- **No permite reabrir un pedido descartado** (§12.6).

**Dónde se muestra** — `pedidos.html` · su "?" · `panel.html` (KPIs) · la tarjeta "El
circuito completo".

---

### F5 · El post-venta: cobro y entrega

**Qué lo dispara** — Que exista la venta. Los dos caminos —cobrar y entregar— son
**independientes**: esa separación es la razón de ser de este flujo, porque uno cobra y
otro entrega.

**Qué crea** — Dentro de la venta, y nada más que ahí:
- **`pago.registros[]`** — un registro por cobro: monto, moneda, **método** (Efectivo y
  Transferencia son base; los demás salen de `metodosPago` y se pueden agregar en el
  momento), nota libre, **quién** lo registró y **cuándo** (ms, §3.7).
- **`entrega`** — estado `pendiente → preparada → entregada`, con **historial de quién
  cambió cada estado y cuándo**.

**Quién lo ve** — Administradores. `ventas.html` ordena de más reciente a más antiguo y
tiene buscador, **filtros por estado de pago y de entrega** y KPIs: cantidad, total UYU,
total USD y **Por cobrar** por moneda.

**Cómo termina** — Pago: cuando el saldo de **cada** moneda llega a cero, el estado
derivado pasa a *Pagada* (§3.5) — nadie lo marca. Entrega: en `entregada`.

**Qué NO hace**
- **No guarda el estado de pago.** Se deriva, siempre, de los registros contra los
  totales, por moneda.
- **No compensa monedas:** una venta puede estar pagada en UYU y con saldo en USD, y se
  muestra así.
- **No edita ni borra un registro de pago.** Un cobro mal cargado se corrige con otro
  registro que lo explique en la nota.
- **No devuelve stock** al retroceder una entrega.
- **No manda comprobantes ni avisos** al comprador.

**Dónde se muestra** — `ventas.html` (pago, entrega, detalle de artículo con fotos,
descripción y **ubicación en el depósito** para armar el paquete) · su "?" ·
`panel.html` (KPI Por cobrar) · el historial de compras en `llaves.html`.

---

### F6 · Las fotos: de la cámara al visor

**Qué lo dispara** — En `inventario.html`, los dos botones separados: **Cámara**
(`capture="environment"`, abre la cámara directo) y **Galería**.

**Qué crea** — Un archivo en Cloudinary (`remate/productos`, preset unsigned
`preset-remate`) y su URL dentro de `productos.fotos[]`. `subirFoto` comprime a JPEG 0.85
y **máx 800px** para productos (2000 por defecto en otros usos).

**Quién lo ve** — Cualquiera: las URLs de Cloudinary son públicas. El catálogo del
comprador y el detalle de artículo de ventas las muestran.

**Cómo termina** — Con la URL guardada. Al tocar cualquier foto —en el formulario, en la
tarjeta del inventario, en el catálogo o en el detalle de la venta— se abre
**`mostrarFoto`**, el visor a pantalla completa con navegación entre todas las fotos del
producto (§3.13).

**Qué NO hace**
- **No sube sin comprimir**, ni a tamaño de escritorio: son fotos de depósito hechas con
  el teléfono.
- **No borra de Cloudinary.** Quitar una foto de un producto la saca del array; el archivo
  queda. Hacerlo de verdad requiere el `api_secret`, que **no puede estar en el cliente**.
- **No abre pestañas nuevas** para ver una imagen (§3.13).
- **No esconde el error:** si Cloudinary rechaza la subida, el toast dice por qué (§3.10).

**Dónde se muestra** — `inventario.html` · `comprador.html` · `ventas.html` (detalle de
artículo).

---

## 11. VERIFICACIONES PENDIENTES

Esta sección no es una lista de deseos: es lo que **hay que abrir y mirar** antes de dar
el sistema por andando.

1. ✅ **Reglas de Firestore v0.3 — verificadas.** Estaban publicadas de verdad; el
   administrador las leyó de la consola y coinciden con lo que el registro decía. Se cierra
   el pendiente más viejo del proyecto.
   ⚠ **Ahora hay que publicar las v0.4** (§5.4): pegar `firestore.rules` completo. Después
   de pegarlas, probar en este orden: abrir el panel (si la ficha de usuario no se lee, no
   entra nadie), **agregar un método de pago en Ventas** —es la colección que vivía del
   catch-all—, cargar un producto, y abrir el catálogo con una llave en otro navegador.
2. ✅ **Preset de Cloudinary `preset-remate`** (unsigned) — creado y verificado, la carga
   de fotos funciona.
3. **Prueba de circuito completo v0.5**, en este orden: crear un producto con nombre +
   descripción y foto → generar la llave → abrir el link **en otro navegador** → armar el
   carrito probando **lote y propuesta** → enviar → validar en Pedidos → en Ventas
   registrar un **pago parcial**, verificar el saldo y el estado derivado, completar el
   pago, marcar preparada y entregada → verificar que el stock se descontó, que el
   historial aparece en la llave y que el Historial del producto en Inventario muestra al
   comprador.
4. **Índice de Firestore, posible.** `pedidos.html` ordena por `actualizadoEn`: si aparece
   el error en la consola del navegador, Firestore da el link para crearlo con un toque.
5. **La PWA, después de subir iconos nuevos.** Instalar el panel desde el teléfono
   (Chrome → Instalar aplicación) y mirar el icono en el lanzador: es el único lugar donde
   se ve si el maskable quedó bien recortado. Si el icono viejo persiste, desinstalar y
   volver a instalar — el service worker cachea, y el sistema operativo también.

---

## 12. PENDIENTES

1. **Notificaciones** — avisar a los dos administradores cuando un comprador envía un
   pedido o una oferta. EmailJS (resumen) + CallMeBot (WhatsApp) vía Netlify, reutilizando
   lo de Casa Verde. **Decisión abierta:** compartir el proyecto Netlify de Casa Verde o
   crear uno propio, teniendo en cuenta el manejo de créditos (publish manual + repo
   desconectado). Es lo único que le falta al circuito para no depender de que alguien
   abra el panel.
2. **Dominio propio** — la URL ya existe (`rematetaller.github.io/remate/`); falta decidir
   si va dominio propio. Cuando se decida, revisar todo lo que arma links absolutos,
   empezando por el mensaje precargado de WhatsApp.
3. **Favicon y `theme-color` en las dos páginas públicas** — `index.html` y
   `comprador.html` no tienen ninguno de los dos. Sin manifest ni service worker (§3.17).
4. **`CACHE_NAME` dice `ratetaller-cache-v1`** — le falta la "m". No rompe nada, es solo un
   nombre de caché, pero conviene arreglarlo antes de que exista una v2 y el error quede
   fosilizado en la lógica de limpieza.
5. **Fotos más livianas sin costo (nivel 0 de Cloudinary)** — Cloudinary transforma **al
   entregar**, no al guardar: agregando la receta a la URL, el original queda intacto y la
   receta se cambia después sin resubir nada. Helper `urlFoto(url, receta)` en `utils.js`
   que inserta las transformaciones en la URL ya guardada, sin tocar el schema:
   `f_auto,q_auto` (WebP/AVIF según el navegador), `w_400,c_fill,g_auto` para las
   miniaturas del catálogo, `e_improve,e_auto_contrast` para emparejar fotos de depósito.
   Baja la miniatura de ~120KB a ~20KB.
6. **Fondo blanco de catálogo (nivel 1)** — `e_background_removal` + `b_white`. El add-on
   dedicado está por deprecarse y las cuentas creadas después del 1-feb-2026 (la de
   remateTaller es de julio) no pueden suscribirse: va por la transformación, que consume
   una cuenta especial contra los créditos del plan. **Probarlo a mano en una URL y mirar
   el consumo antes de decidir.**
   > Descartado a conciencia: reconstruir la foto con IA generativa (Netlify + key
   > server-side). Reinventa detalle, y en una venta de restos y saldos sin documentación
   > entre particulares, una foto embellecida o con cosas borradas es un reclamo esperando
   > pasar.
7. **Oferta global del pedido** — hoy la propuesta de precio es por lote de cada producto.
   Falta decidir si tiene sentido una oferta sobre el total, y con qué umbral.
8. **Versión visible en las páginas HTML** (§3.16): hoy solo la tienen `utils.js` y
   `design-system.css`.
9. **Badge de pedidos sin revisar** en la navegación del panel.
10. **Cotización UYU/USD** — hoy cada producto vive en su moneda y los totales van
   separados (§1.3). Evaluar si el comprador necesita **ver** una conversión, sabiendo que
   el sistema no va a calcular con ella.
11. **Botón "Reabrir"** en pedidos descartados (devolverlos a `enviado`), si retomar
   negociaciones sin generar llave nueva se vuelve frecuente.
12. **Roles: admin y operador.** El `rol` ya lo lee la regla (`esAdmin()`), pero todos los
   usuarios se crean como `admin`. Falta decidir **qué no puede hacer un operador** y
   escribirlo en las reglas y en el panel. Siendo dos personas de confianza no da ventaja
   operativa: entra como experimento y por reuso, y conviene llamarlo por su nombre.
13. ✅ **Autoprovisión de `utils.js` retirada** (tanda 12). En su lugar, un cartel que dice
   qué pasó y muestra el UID para que un administrador dé de alta la ficha.
14. **`compradores/{telefono}`** — una ficha por persona, con el teléfono normalizado como
   id, y las llaves apuntando ahí. Hoy la historia de un comprador que compró tres veces
   está partida en tres llaves. **Descartado en el camino:** darle al comprador una cuenta
   de Auth con la llave como contraseña. No tienen mail, la cuenta sobrevive a la llave que
   vence, y cada comprador autenticado entraría por la misma puerta que los
   administradores. La llave ya es la credencial y la regla ya la valida en el servidor.
15. **Ayuda en el `index.html` público**, si hiciera falta: hoy los tres textos editables de
   `config/publico` cubren los casos de llave inválida (Libro 3).

---
---

# LIBRO 2 · MASTER BRIEFING

> El registro de tandas, de la más reciente a la más vieja. **Lo que importa está
> arriba**: el resto es historia consultable, y se conserva porque explica por qué el
> sistema es como es. Borrarla es cómo nacen los fósiles que esta documentación viene a
> evitar.
>
> **Convención de versionado:** el documento sube una versión menor por tanda
> (`v0.5.1` → `v0.5.2`). Las correcciones dentro de una misma tanda llevan sufijo.

---

## v0.5.5 — Salir del panel de verdad (Tanda 12 · 7-ago-2026)

> **Entrega:** `interno/utils.js` v1.6 + esta edición. Sin cambios de reglas ni de datos.
>
> **El síntoma era "no hay cómo cerrar sesión".** El diagnóstico fue otro: **sí había**,
> era el último ítem de la barra de navegación, y la barra scrollea horizontal. En un
> teléfono entran cinco ítems, así que "Salir" estaba fuera de pantalla desde la tanda 1.
> Un botón que existe pero no se ve no es un botón. De acá sale la regla §3.19.
>
> **Qué reemplaza a eso:** el avatar con las iniciales en la topbar abre una hoja de cuenta
> con el nombre, el mail, **Cerrar sesión** y **Reparar la app**. Patrón tomado de Casa
> Verde, donde nació por el mismo motivo.
>
> **Y lo que importa más que el botón:** `cerrarSesion` ahora **limpia la caché local**.
> La caché de Firestore es una por navegador; un `signOut` pelado deja los datos adentro y
> la próxima persona que entre en ese teléfono los hereda. El caso de uso que lo pidió es
> justo ese: salir para probar como comprador, o prestarle el teléfono a alguien.
>
> **"Reparar la app"** borra service workers, cachés y bases locales, sin tocar el
> servidor (§3.20). remateTaller es PWA instalable desde la tanda anterior: dentro de la
> app instalada no hay consola para borrar los datos del sitio.
>
> **Se cerró §12.13:** la autoprovisión muerta salió de `utils.js`. Ahora, si alguien entra
> con una cuenta de Auth sin ficha habilitada, ve un cartel que lo dice **y muestra su
> UID** para que un administrador lo dé de alta — antes rebotaba a `login.html` sin
> explicación, que se parece a una contraseña mal puesta.
>
> **Sumado al núcleo:** `escapar()` (había HTML armado a mano sin escapar) y `usuario()`,
> que devuelve la ficha en memoria y va a ser la base de los permisos de la tanda que viene.
>
> **Lo que esta tanda NO toca**, y está decidido en conversación pero sin escribir código:
> los permisos (`inventario` / `cobros` / `entregas` / `llaves` / `validar`, §12.12), el
> ciclo del precio con la bandeja de pendientes de tasar, y la digitalización de las
> libretas de propiedad con su búsqueda por aproximación. Las tres esperan turno.

## v0.5.4 — Reglas v0.4: autenticado deja de ser suficiente (Tanda 11 · 7-ago-2026)

> **Entrega:** `firestore.rules` (nuevo archivo en la raíz) + esta edición del documento.
> **Acción manual: pegar las reglas completas en la consola.** Sin eso, esta tanda no
> existe.
>
> **Se cerró la verificación más vieja del proyecto.** Las v0.3 estaban publicadas de
> verdad. El registro decía la verdad; lo que faltaba era mirar. Queda como lección al
> revés: el problema no era la regla, era que nadie había abierto la consola en dos meses.
>
> **Y al mirarlas apareció algo peor que lo que se buscaba.** Las v0.3 autorizaban con
> `request.auth != null` y nada más. Dos consecuencias que no estaban escritas en ningún
> lado: desactivar a un usuario le cortaba el panel pero **no los datos**, y `usuarios`
> era escribible por cualquiera con sesión, así que el rol —que estaba por convertirse en
> el eje de los permisos— vivía en un documento que su propio dueño podía editar. Es el
> error clásico del esquema de roles en documentos, y estaba a una tanda de distancia de
> importar de verdad.
>
> **Qué hace la v0.4:** saca el catch-all y pasa a **default deny** (§5.3), cierra
> `usuarios` a los admin con la prohibición de auto-desactivarse y auto-promoverse escrita
> en la regla, y exige **usuario activo** —no solo autenticado— en toda escritura de
> administración (§5.6).
>
> **Efecto colateral buscado:** al sacar el catch-all, `metodosPago` quedó sin regla y hubo
> que escribirle la suya. Vivía de la barredora desde la tanda 6 sin que nadie lo supiera.
> Es el argumento entero a favor del default deny.
>
> **Y uno no buscado, que queda anotado:** la autoprovisión de `utils.js` deja de poder
> escribir (§5.7). Es correcto que no pueda —si el cliente crea su propia ficha, el agujero
> vuelve—, no rompe nada hoy porque los dos administradores ya tienen documento, y el
> camino de alta que ya existe en `configuracion.html` es el bueno. Limpiar ese bloque
> muerto queda como §12.13.
>
> **Decisión de arquitectura, para no repetirla:** el rol se queda en el documento por
> ahora. Las **custom claims** son gratis en las reglas y son lo recomendado cuando el rol
> casi no cambia, pero necesitan Admin SDK, o sea servidor. El día que exista la función de
> Netlify de las notificaciones, ese es el momento de mudarlo.
>
> **También quedó descartado por escrito** darle cuenta de Auth al comprador (§12.14): la
> llave ya es la credencial y la regla ya la valida en el servidor.

## v0.5.3 — El icono, y la capa PWA sale de la sombra (Tanda 10 · 7-ago-2026)

> **Entrega:** los siete archivos de `interno/icons/` + `icon.svg` + esta edición del
> documento.
>
> **El icono.** El anterior era un signo abstracto. El nuevo es literal: **un martillo de
> rematador cuyo mango es una llave mecánica**, golpeando la base — el remate y el taller
> en un solo dibujo. La primera versión tenía la cabeza y el mango en ángulos parecidos y
> se fundían en un bulto que no se leía como martillo; la que quedó respeta la orientación
> del ícono `gavel` de la topbar (cabeza arriba a la derecha, base abajo a la izquierda) y
> pone la boca de la llave en el extremo del mango, donde se distingue incluso a 32px.
> Nace `icon.svg` como fuente de verdad (§3.18), que antes no existía: los PNG estaban
> sueltos, sin nada de dónde regenerarlos.
>
> **Dos correcciones técnicas del set:** el maskable pasa a ir **a sangre**, sin esquinas
> redondeadas propias — el anterior las traía y, con máscara cuadrada, Android dejaba las
> esquinas transparentes. Y los favicon de 16 y 32 usan una variante simplificada, sin el
> hueco de la boca, que a ese tamaño se empasta y ensucia la silueta.
>
> **La capa PWA estaba sin documentar.** Al cargar el repositorio completo aparecieron
> `sw.js`, `manifest.webmanifest`, `interno/icons/`, el `theme-color` y los links de
> favicon en las ocho páginas internas: **nada de eso figuraba en el briefing**. Ahora está
> en §2, en §2.1 y en el inventario de §6. Es exactamente el fósil que este documento viene
> a evitar, y apareció en la primera revisión contra el repo de verdad.
>
> **Decisión tomada: la PWA es del panel, no del sitio público** (§3.17 nueva). Ya estaba
> bien resuelto sin saberlo — `sw.js` vive en `interno/` y lo registran solo las páginas de
> ahí, así que su alcance nunca toca el catálogo del comprador. Queda escrito para que no
> se "arregle" por descuido: al comprador que entra una vez con una llave que vence,
> instalar la app no le sirve, y un catálogo cacheado muestra stock que ya no existe.
>
> **También se cerró §12.2:** la URL es `https://rematetaller.github.io/remate/` (usuario
> `rematetaller`, repo `remate`). Queda pendiente solo el dominio propio.
>
> **Tres cosas que la revisión encontró y esta tanda NO toca**, para no mezclar asuntos:
> las páginas públicas sin favicon ni `theme-color` (§12.3), el `CACHE_NAME` al que le
> falta una letra (§12.4) y las transformaciones de entrega de Cloudinary (§12.5).
>
> **Y sigue arriba de todo, sin confirmar, lo mismo de siempre: las reglas v0.3** (§11.1).

## v0.5.2 — El documento único entra al repositorio (Tanda 9 · 7-ago-2026)

> **Sin cambios de código, sin cambios de reglas.** Esta tanda entrega un solo archivo:
> `interno/REMATETALLER-DOCUMENTACION.md`.
>
> **La decisión.** Los tres documentos que Casa Verde tiene separados —convenciones,
> briefing y guía del sitio público— acá nacen juntos en un archivo, porque el proyecto es
> chico y porque el objetivo es subirlo de una vez al conocimiento y al repositorio. Hasta
> hoy había un solo documento, el Master Briefing, que mezclaba **tres cosas distintas**:
> las reglas que no cambian, el estado actual y la historia. Con ocho tandas ya se notaba
> el costo: las convenciones estaban repartidas entre una lista al final de §6 y frases
> sueltas del registro de cambios, y las verificaciones pendientes vivían al lado de los
> pendientes de producto, como si fueran lo mismo.
>
> **Qué se agregó y no existía antes:**
> · **Libro 1 · §3 · reglas de código numeradas** (3.1 a 3.16). Estaban dispersas: la
>   prohibición de `orderBy` por `nombre`, el `serverTimestamp()` que no sirve dentro de un
>   array, el `<summary>` que se come el toque, `iniciarAyuda` después del saludo. Ahora
>   tienen número y se pueden citar.
> · **§10 · FLUJOS** — los seis procesos escritos de punta a punta, cada uno con **qué NO
>   hace** y con la línea *"dónde se muestra"*, que es la lista de pantallas a revisar
>   cuando el proceso cambie (§8.6). Esta sección es la que Casa Verde tuvo que inventar
>   cuarenta tandas tarde, después de descubrir tres pantallas describiendo un modelo que
>   había cambiado y que nadie había notado.
> · **§9 · trampas conocidas y lo que no se hace** — separando el síntoma ("el comprador no
>   ve el catálogo") de la causa ("las reglas publicadas no son las escritas").
> · **§8.6 nueva** — cambiar un estado obliga a actualizar el texto de la ayuda que lo
>   explica. Con la ayuda contextual dentro del sistema, un estado renombrado deja una
>   explicación falsa **adentro del producto**, no en un documento aparte.
> · **§5.5** — el día que exista un `config/integraciones` con claves, se excluye del
>   catch-all. Se escribe ahora, antes de que las notificaciones lo necesiten.
> · **Libro 3** — la guía del acceso público: la puerta, los tres textos editables, el
>   circuito de WhatsApp y el checklist antes de dar un cambio por publicado.
>
> **La contrapartida, dicha sin adornos:** GitHub Pages sirve los `.md` en texto plano, así
> que este archivo **es público**, con los mails y los `uid` de los dos administradores
> adentro. No es un agujero de seguridad —las reglas las aplica el servidor, no el
> secreto—, y esos datos ya estaban públicos en `utils.js` (`ADMINS_INICIALES`) desde antes.
> Es un dato personal expuesto que conviene saber que está expuesto.
>
> **Acción:** subir `interno/REMATETALLER-DOCUMENTACION.md`, sacar
> `Master_Briefing_remateTaller_v0_5_1.md` del conocimiento del proyecto y borrarlo del
> repositorio si estaba subido. **Un solo documento.**
>
> **Lo que sigue pendiente y esta tanda no toca:** las cuatro verificaciones de §11 —en
> especial **las reglas v0.3, que siguen sin confirmarse**— y los siete pendientes de §12,
> con las notificaciones a la cabeza.

## v0.5.1 — El visor de fotos a pantalla completa (11-jul-2026)

> `mostrarFoto(urls, indice)` en **utils.js v1.5**: overlay autoinyectado, navegación ‹ ›
> y contador cuando hay varias, cierra con × o tocando el fondo. Enganchado en
> **inventario v1.5** (miniaturas del formulario y foto de la tarjeta, frenando el toggle
> del `summary` — de acá sale la regla §3.12), **comprador v2.3** (la foto del catálogo
> abre todas las fotos del producto) y **ventas v2.2** (el detalle de artículo usa el visor
> en lugar de abrir una pestaña nueva).

## v0.5 — Tanda 8: el sistema se explica a sí mismo (11-jul-2026)

> **panel.html v1.1** — la ayuda pasa a contar la **visión general del sistema**, y la
> tarjeta **"El circuito completo"** reemplaza un texto de primeros pasos que estaba
> desactualizado. `iniciarAyuda` se llama **después** de setear el saludo, porque el saludo
> reemplaza el `h1` (§3.11).
> **comprador.html v2.2** — tarjeta desplegable **"¿Cómo comprar?"** con la guía del
> comprador: stepper, lote, propuesta, autoguardado, monedas separadas, envío y edición
> posterior. El comprador no tiene a quién preguntarle: o lo explica la página, o no se
> explica.

## v0.4.1 — Tanda 7: ayuda contextual en todo el panel (11-jul-2026)

> `iniciarAyuda(titulo, html)` + `mostrarAyuda` en **utils.js v1.4**, con estilos y modal
> autoinyectados **sin tocar `design-system.css`**: el "?" junto al `h1` abre el panel
> explicativo. Textos de estados y acciones en **pedidos v1.2, ventas v2.1, inventario
> v1.4, llaves v1.2 y configuracion v1.2**.
> **Objetivo declarado:** coherencia del sistema y **evitar errores de registro** cuando
> uno cobra y otro entrega.

## v0.4 — Tandas 5 y 6: el producto se parte en dos y nace el post-venta (11-jul-2026)

> **Tanda 5 · inventario.html v1.3** — formulario desplegable tras el botón "Agregar nuevo
> producto"; el producto pasa a tener **`nombre` + `descripcion`**, retrocompatible vía
> `nombreDe` (§3.6); tarjetas **colapsadas** con Editar / **Historial** (quién compró ese
> producto, leído desde `ventas`) / Eliminar. **comprador.html v2.1** muestra nombre +
> descripción y **guarda el nombre en `items.descripcion`** para no romper la
> compatibilidad de pedidos y ventas.
>
> **Tanda 6 · el post-venta · ventas.html v2.0** — pagos parciales (`pago.registros[]`),
> **estado derivado del saldo por moneda**, métodos de pago preseteados + agregables en el
> momento (nueva colección **`metodosPago`**, copiando el patrón de `categorias`), entrega
> con estados e historial de quién cambió qué, detalle de producto por ítem (fotos,
> descripción, **ubicación en el depósito**), filtros por pago y entrega, KPI **Por
> cobrar**. **pedidos.html v1.1** inicializa `pago` y `entrega` al validar **preservando lo
> que ya exista** (§3.4).
>
> **Decisión de fondo: el estado de pago se deriva, nunca se guarda** (§1.2, §3.5).

## v0.3.2 — Categorías borrables y errores de Cloudinary visibles (11-jul-2026)

> Botón de eliminar categoría, **solo si no tiene productos** (chequeo con
> `getCountFromServer`). Y los errores de subida de fotos pasan a mostrar **la causa que
> devuelve Cloudinary** en lugar del código HTTP: **eso permitió diagnosticar y resolver el
> preset en minutos**, después de que un "400" genérico lo hubiera tapado. De acá sale la
> regla §3.10. **utils.js v1.3, inventario.html v1.2.**

## v0.3.1 — Cámara directa y fotos livianas (11-jul-2026)

> Botones separados de **cámara directa** (`capture="environment"`) y **galería**;
> redimensionado a **máx. 800px** para productos, criterio heredado de las facturas de Casa
> Verde. `subirFoto` acepta `maxLado` (default 2000). **utils.js v1.2, inventario.html
> v1.1.**

## v0.3 — Tanda 3: el circuito completo, de punta a punta (11-jul-2026)

> Inventario; **comprador v2** (catálogo completo, carrito con autoguardado, lote +
> propuesta, totales por moneda, envío); **pedidos** (edición y validación, con descuento
> de stock y snapshot en `ventas`); **ventas** (historial + KPIs); **llaves v1.1**
> (historial de compras por comprador); **configuracion v1.1** (gestión de usuarios).
> **Reglas de Firestore v0.3**, con validación de llave **server-side**.
>
> **Tres decisiones estructurales que siguen vigentes:** catálogo de **lectura pública**
> con el filtrado en la interfaz (§5.1); **un pedido por llave**, con ID determinístico; y
> **totales siempre separados por moneda**.

## v0.2 — Tandas 1 y 2: la base (11-jul-2026)

> Base del panel, acceso público con llaves, generador de llaves, configuración pública
> editable.

## v0.1 — Borrador inicial (11-jul-2026)

> El objetivo del negocio y el modelo de datos, escritos antes de la primera línea de
> código.

---
---

# LIBRO 3 · GUÍA DEL ACCESO PÚBLICO

### v1.0 · agosto 2026

Todo lo que pasa **antes** de que el comprador tenga acceso, y todo lo que ve mientras lo
tiene. Esta guía manda sobre los dos archivos de la raíz; el Libro 1 manda sobre el panel.

---

## 1 · Qué es y qué no es

**Es** una puerta con una sola pregunta: *¿tenés una llave válida?* Nada más.

**No es** un sitio institucional, ni una tienda, ni tiene portada, ni catálogo abierto, ni
buscador público, ni SEO. **Y no debería tenerlo:** el negocio es vaciar un depósito de
restos y saldos sin documentación, que solo puede venderse entre particulares. La
discreción no es una decisión de diseño, es el modelo del negocio.

**No hay registro de compradores.** No hay cuenta, ni contraseña, ni recuperación de
contraseña, ni mail de confirmación. Hay una llave que alguien mandó por WhatsApp.

---

## 2 · Los archivos

| Archivo | Qué hace |
|---|---|
| `/index.html` | La puerta. Toma la llave del parámetro `?llave=CODIGO` o del campo manual, la valida con `validarLlave` y manda a `comprador.html?llave=…` — o muestra el aviso con el botón de WhatsApp |
| `/comprador.html` | El catálogo y el carrito. Solo se llega con llave válida (F3) |

**Ninguna de las dos tiene manifest ni service worker, y es la decisión** (§3.17). Sí les
faltan el favicon y el `theme-color`, que sí corresponden: hoy la puerta y el catálogo
aparecen en la pestaña sin icono (§12.3).

**Cargan del panel solo lo compartido:** `interno/design-system.css` por `<link>` y
`interno/utils.js` por `import './interno/utils.js'`. **No importan nada más de
`interno/`** y no dependen de que exista una sesión: si el comprador tuviera que
autenticarse, no habría llaves.

**Las dos llevan el `<link>` de Material Icons antes del CSS** (§3.14). Falta uno solo y la
puerta aparece con los nombres de los íconos escritos en texto — en la primera pantalla que
ve un desconocido.

---

## 3 · Lo que lee sin sesión

`llaves/{codigo}` (**`get` puntual, nunca `list`**), `config/publico`, `categorias` y
`productos`. Escribe únicamente en `pedidos/ped-<codigo>`, y solo si la llave está vigente
y el pedido está `abierto` o `enviado`. Todo eso lo garantizan las reglas de §5.4, **no la
interfaz**.

> Si el comprador entra y ve un catálogo vacío, con el panel funcionando bien: **son las
> reglas** (§11.1). Es el error más caro del proyecto hasta hoy, porque no se parece a un
> error.

---

## 4 · Los textos editables — `config/publico`

Se editan desde `configuracion.html`, sin tocar código. Son la voz del negocio con un
desconocido, así que se escriben en rioplatense y con nombre y apellido de persona, no de
sistema.

| Campo | Cuándo se muestra |
|---|---|
| `nombreContacto` | Quién firma el mensaje de WhatsApp |
| `telefonoWhatsapp` | El número al que va el botón de contacto |
| `mensajeBienvenida` | Al entrar con una llave válida |
| `mensajeVencido` | Llave vencida o revocada |
| `mensajeSinLlave` | Llave inexistente, mal escrita, o entrada sin código |
| `mensajePrecargado` | El texto que el administrador manda junto con el link, al crear la llave (F2) |

Quedan registrados `actualizadoEn` y `actualizadoPor`: es un dato público y conviene saber
quién lo cambió.

**Los tres mensajes de error son tres, no uno.** "No pudimos validar tu acceso" no le sirve
a nadie: **vencida** se resuelve pidiendo otra, **mal escrita** se resuelve mirando el
código, y son conversaciones distintas por WhatsApp.

---

## 5 · El circuito de WhatsApp

WhatsApp es el único canal con el comprador, en las dos direcciones:

1. **De salida** — al crear la llave, `llaves.html` arma el mensaje con
   `mensajePrecargado` + el link `URL/?llave=CODIGO` y abre WhatsApp.
2. **De entrada** — cuando la llave no sirve, la puerta muestra el botón que abre WhatsApp
   contra `telefonoWhatsapp`, firmado por `nombreContacto`.

**Qué NO hace este circuito**
- **No avisa a los administradores cuando llega un pedido.** Hoy hay que abrir el panel.
  Es el pendiente §12.1 (EmailJS + CallMeBot vía Netlify).
- **No manda nada automático al comprador**: ni confirmación de pedido, ni recibo, ni aviso
  de que la llave está por vencer.
- **No verifica el teléfono.** El de la llave es un dato de contacto, no una credencial: la
  credencial es el código.

---

## 6 · El código de la llave

Ocho caracteres, **sin caracteres ambiguos** (nada de confundir 0 con O ni 1 con l): está
pensado para que alguien lo lea de una pantalla y lo escriba en otra, o lo dicte por
teléfono.

**El código es la credencial.** Por eso `llaves` **nunca** se puede listar sin sesión
(§5.1): poder listarlas sería publicar todas las credenciales de una vez. Y por eso el link
se manda por WhatsApp a un teléfono concreto, no se publica en ningún lado.

---

## 7 · Despliegue

**GitHub Pages, directo desde el repositorio.** No hay build, ni Actions, ni
`package.json`: **lo que se sube queda en vivo**. No hay etapa intermedia donde revisar,
así que el checklist de abajo no es burocracia — es la única revisión que existe.

**La URL es `https://rematetaller.github.io/remate/`** — usuario `rematetaller`, repo
`remate`, la parte pública en la raíz y el panel en `/interno/`. Falta solo decidir el
dominio propio (§12.2); cuando se decida hay que revisar todo lo que arma links absolutos,
empezando por el mensaje precargado de WhatsApp, que lleva la URL adentro.

---

## 8 · Checklist antes de dar por publicado un cambio en la parte pública

1. Abrir la puerta **con un link de llave válida**, en un navegador donde no haya sesión de
   administrador (otro navegador, o ventana privada). Probar logueado no prueba nada: el
   administrador pasa por las reglas del panel.
2. Probar los **tres** casos de llave que no sirve: vencida, revocada e inexistente. Que
   cada uno muestre su texto y que el botón de WhatsApp abra el número correcto.
3. En el catálogo: que se vean **solo las categorías de esa llave** y **solo lo que tiene
   stock**.
4. Agregar algo al carrito, **cerrar la pestaña y volver a entrar**: el autoguardado tiene
   que devolver el carrito como estaba.
5. Probar **lote completo** y **proponer precio** en un producto que tenga `precioLote`, y
   en uno que no lo tenga.
6. Que la barra de totales muestre **UYU y USD separados** y que ninguno de los dos quede
   tapado por el teclado ni por el borde de la pantalla.
7. Tocar una foto: tiene que abrir el visor a pantalla completa, no una pestaña nueva.
8. Enviar el pedido y verificar que aparece en `pedidos.html` como **enviado**.
9. Volver a entrar con la misma llave: el comprador tiene que **poder seguir editando**.

---

## 9 · Deuda conocida de la parte pública

1. **No hay aviso a los administradores cuando llega un pedido** (§12.1). Es la única pieza
   que falta para que el circuito no dependa de que alguien abra el panel.
2. **Sin favicon ni `theme-color`** en las dos páginas públicas (§12.3), y **dominio
   propio sin decidir** (§12.2).
3. **Una llave, un pedido.** Si el comprador quiere volver a comprar hay que generar otra
   llave, y la anterior queda en su historial. Es la decisión (F2), pero si se vuelve
   incómoda, el lugar de la discusión es §12.6.
4. **La puerta no tiene ayuda propia** (§12.7): hoy los tres textos editables cubren los
   casos. Si empiezan a llegar preguntas por WhatsApp que los textos ya contestan, es señal
   de que hace falta.
5. **Sin traducción, sin idioma alternativo, sin accesibilidad auditada.** Nada de eso está
   en el alcance, y conviene que quede escrito para que nadie lo descubra como si fuera un
   olvido.
