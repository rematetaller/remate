# Las luces del depósito

Encender y apagar las luces del depósito desde el panel, sin estar al lado de
la llave. Las luces ya están conectadas a un dispositivo **Tuya**; lo que se
agregó es el camino desde el teléfono hasta ese dispositivo.

| | |
|---|---|
| La pantalla | `interno/luces.html` — entra por la barra, con el permiso `luces` |
| El puente | `api/tuya.mjs` — servido desde el **Netlify de Casa Verde** (`serene-scone-76bd4e`) por `netlify/functions/luces-remate.mjs`, desde el 1-oct-2026 |
| Configuración del puente | `PUENTE_LUCES` en `interno/utils.js` |
| Registro | colección `lucesRegistro` de Firestore, reglas **v0.7** |
| Pruebas | `node pruebas/luces.mjs` — 28 casos, sin npm (4 pasan por el adaptador de Netlify) |

---

## 1. Por qué hay un servidor, si este proyecto no tenía ninguno

Hasta ahora remateTaller era estático puro: HTML, CSS y JS servidos tal cual
por GitHub Pages, sin build ni funciones. **Eso sigue siendo cierto para todo
menos para esta pieza**, y la excepción tiene un motivo que no se puede
esquivar: la nube de Tuya exige que cada pedido vaya **firmado con un secreto**
(HMAC-SHA256). Un secreto en el navegador no es un secreto — cualquiera que
abra el código lo lee, y con él enciende y apaga las luces del depósito desde
donde quiera.

No hay forma de hacer esto sin un servidor. Lo que sí se puede es que el
servidor sea **lo más chico posible**: una sola función, que no sabe nada del
negocio y sólo hace tres cosas — comprobar quién pide, comprobar que puede, y
firmar.

**El sitio no se mudó.** GitHub Pages sigue publicando todo. El servidor sirve
únicamente el puente, desde el Netlify de Casa Verde (§ 3.2).

---

## 2. Quién puede encender la luz

No hay contraseña compartida, y es lo más importante de este diseño. El panel
manda el **token de sesión de Firebase** de la persona que está mirando la
pantalla, y el puente hace dos cosas distintas que conviene no confundir:

**Autenticar** — verifica la firma RS256 del token contra las claves públicas
de Google. Eso prueba *quién es*, y que el token no está vencido ni fabricado.

**Autorizar** — lee `usuarios/{uid}` por la API REST de Firestore **usando ese
mismo token**, no una credencial de servidor. La lectura pasa por las reglas de
Firestore igual que si la hiciera el navegador, y quien decide sigue siendo la
ficha: `activo == true`, y `rol == 'admin'` o `permisos.luces == true`.

> **Que el puente no tenga credencial de servidor de Firebase es deliberado.**
> Un *service account* en el servidor sería una llave maestra de toda la base —
> ventas, documentos, llaves de compradores — para prender una luz. Así como
> está, el puente no puede leer nada que la propia persona no pudiera leer.

Y sigue valiendo la regla de siempre: **esconder el botón no protege nada.** La
pantalla oculta la sección a quien no tiene el permiso, pero el que dice que no
es el servidor.

---

## 3. Puesta en marcha

Son cuatro pasos y hay que hacerlos en orden. Los tres primeros son en la web
de otros; el cuarto es un renglón en este repositorio.

### 3.1 · En Tuya

1. Entrar a `iot.tuya.com` → **Cloud → Development → Create Cloud Project**.
   Anotar el **Access ID** y el **Access Secret**. Elegir el centro de datos
   que corresponda: para Uruguay normalmente *Western America* (`us`).
2. **Devices → Link App Account**: vincular la cuenta de la app Smart Life /
   Tuya Smart donde ya están las luces del depósito.
3. **Service API → Go to Authorize**: habilitar *IoT Core* y *Authorization*.
   Sin esto, la firma va a estar bien y Tuya va a contestar que no igual.
4. En **Devices**, copiar el **Device ID** de cada luz.

Para saber el nombre del comando de cada aparato (`switch_1`, `switch_led`,
`switch`…): Devices → el aparato → **Device Debugging**, ahí figuran sus
*instructions*. Si no coincide, el puente firma bien y Tuya responde que el
código no existe.

### 3.2 · En Netlify (antes decía Vercel)

**Hasta el 1-oct-2026 este paso era crear un proyecto en Vercel**, y no se pudo:
conectar la cuenta de GitHub `rematetaller` con la de Vercel volvía siempre a
«Install» sin terminar. Mauro: «hazlo, porque me sigue dando vueltas». El
puente se sirve desde el **Netlify de Casa Verde** (`serene-scone-76bd4e`), que
ya es el servidor del ecosistema —`claude-proxy`, los avisos por WhatsApp— y se
despliega con un zip a mano. Ganancia aparte: las claves de servidor de todo el
ecosistema quedan en UNA consola. `api/tuya.mjs` no cambió una línea:
`netlify/functions/luces-remate.mjs` sólo traduce el pedido de Netlify al
`req`/`res` que espera, y el banco lo prueba.

**El zip.** El de Casa Verde lleva sus funciones **y** estas tres, con las
mismas rutas que en este repositorio: `netlify/functions/luces-remate.mjs`,
`api/tuya.mjs` y `api/_sesion.mjs`. El zip reemplaza el sitio entero: uno sin
`luces-remate` apaga las luces en silencio, igual que uno sin las funciones de
Casa Verde apaga lo de ellos. Lo lista `netlify.toml` de Casa Verde.

**Las variables**, en Netlify → `serene-scone-76bd4e` → **Project configuration
→ Environment variables** (los nombres están en [`.env.example`](.env.example)):

```
TUYA_CLIENT_ID        el Access ID
TUYA_CLIENT_SECRET    el Access Secret
TUYA_REGION           us
TUYA_LUCES            {"deposito":{"id":"...","label":"Luces depósito","comando":"switch_1"},
                       "entrada":{"id":"...","label":"Entrada y taller","comando":"switch_1"}}
ORIGENES_PERMITIDOS   https://rematetaller.github.io
```

Las dos luces son el producto `s180v3.1` y las dos usan `switch_1` (Device
Debugging, 1-oct-2026). Los identificadores reales van sólo ahí.

> **Los valores los carga Mauro a mano, en la web de Netlify.** Ningún chat pide
> el valor de una credencial ni lo carga por API. Ver `PROTOCOLO-SECRETOS.md`,
> en `protocolos/` del repo **público** `maurogasta-crypto/datos`.

Y después **volver a desplegar** (Deploys → el último → *Options → Retry
deploy*, o soltar el zip de nuevo) y **publicarlo** (*Publish deploy*): el
proyecto tiene la publicación automática bloqueada a propósito.

### 3.3 · En la consola de Firebase

Publicar las reglas **v0.7** (`/firestore.rules`, completas, nunca por
fragmentos). Traen la colección `lucesRegistro`. Sin esto la luz enciende igual,
pero el registro de movimientos no se puede escribir ni leer.

### 3.4 · En este repositorio

**Hecho el 1-oct-2026** (`utils.js` v1.19):

```js
export const PUENTE_LUCES = "https://serene-scone-76bd4e.netlify.app/.netlify/functions/luces-remate";
```

Vacío, la pantalla de luces explica qué falta en vez de fallar con un error de
red que no significa nada. **No es un secreto** — la función no hace nada sin
un token de Firebase válido —, así que puede estar en el repositorio público.

### 3.5 · Habilitar a la gente

Configuración → cada persona → tildar **Luces del depósito**. Los dos presets
de alta (*Ayudante* y *Gestión*) ya lo traen: quien trabaja en el depósito
necesita la luz.

---

## 4. Cómo probar que quedó bien

1. Abrir el panel con una cuenta que tenga el permiso. Tiene que aparecer
   **Luces** en la barra.
2. La pantalla muestra cada luz con su estado real. Si dice *Sin conexión*, el
   aparato no contestó — está sin corriente o sin wifi, y no es un problema del
   puente.
3. Tocar una. Tarda entre medio segundo y dos: la orden va del teléfono a la
   nube de Tuya y de ahí al aparato.
4. El movimiento aparece en **Últimos movimientos**, con nombre y hora.
5. Con una cuenta **sin** el permiso, la sección no tiene que aparecer — y si
   se escribe `luces.html` a mano en la dirección, tiene que cortar el paso.

Y sin tocar nada de esto: `node pruebas/luces.mjs` corre la función de verdad
contra una nube simulada, incluidos los intentos de entrar con un token
falsificado.

---

## 5. Cuando algo no anda

| Lo que se ve | Qué es |
|---|---|
| «Falta configurar la dirección del puente» | El paso 3.4: `PUENTE_LUCES` está vacío |
| «No se pudo llegar al puente» / «El puente respondió 404» | El zip de Netlify no trae `luces-remate`, o no se publicó (*Publish deploy*) |
| «origen no permitido» | `ORIGENES_PERMITIDOS` no incluye la dirección desde la que se abrió el panel |
| «faltan variables de entorno: …» | Están sin cargar en Netlify, **o** se cargaron y no se volvió a desplegar y publicar |
| «tu cuenta no tiene habilitadas las luces» | Falta tildar el permiso en Configuración |
| «las reglas no dejan leer tu ficha» | Las reglas publicadas no son las de este repositorio |
| «Tuya rechazó las credenciales» | Access ID/Secret mal, región equivocada, o falta autorizar *IoT Core* (paso 3.1.3) |
| Enciende pero la pantalla la muestra apagada | El comando de `TUYA_LUCES` no es el que usa ese aparato — ver *Device Debugging* |
| «Sin conexión» | El aparato no está en línea. No es el puente |

---

## 6. Lo que no hace, y por qué

- **No hay control local.** Todo pasa por la nube de Tuya: entre 200 y 600 ms.
  Para encender la luz del depósito está perfecto. El camino local necesita la
  *local key* de cada aparato y estar en la misma red que ellos — o sea, no
  serviría desde afuera, que es justamente cuando hace falta.
- **No hay apagado automático.** Nadie apaga la luz a las 22:00 si quedó
  prendida. El registro sirve para verlo, no para evitarlo.
- **No hay horarios ni escenas.** Eso lo hace la app de Tuya, y hacerlo dos
  veces en dos lugares es la forma más segura de que no coincidan.
- **El registro no se puede corregir.** Un movimiento es evidencia: se agrega y
  no se edita. Si quedó mal, queda mal y se ve.

---

## 7. Al tocar este código

- **Las dos llamadas al puente viven en `interno/utils.js`** (`lucesEstado` y
  `lucesMandar`), no en la pantalla: el token de sesión se pide en un solo
  lugar (§3.2 de la documentación).
- **Nada de credenciales del lado del cliente.** El panel manda un alias; el
  puente traduce y firma. Es la única frontera que importa acá.
- **Si el sitio pasa a dominio propio** (§12.2), `ORIGENES_PERMITIDOS` cambia
  en la misma tanda, o las luces dejan de responder sin aviso.
- **Se corre `node pruebas/luces.mjs` antes de subir.**
- **Que el JavaScript parsee** (`node --check`), incluido el módulo que vive
  adentro de `luces.html`.

---

*Primera versión: 2026-09-09 (tanda 25).*

---

**Desde la tanda 30 (30-sep-2026)** la verificación de la sesión vive en
`api/_sesion.mjs`, afuera de `tuya.mjs`. **Desde la tanda 31 (1-oct-2026)** el
puente se sirve desde Netlify y no desde Vercel (§ 3.2). La IA del inventario
**no** es una función de este proyecto: usa la de Casa Verde (ver `CLAUDE.md`).
