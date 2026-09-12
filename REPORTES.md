# Reportar una falla

Desde la **tanda 27** (12-sep-2026). Quien trabaja en el panel ve una falla en la
pantalla donde está trabajando y la reporta **desde ahí**, sin salir del sitio y
sin cuenta nueva. Después un agente de Claude Code los lee y los convierte en
pendientes del **panel de datos** de Mauro, que es donde él mira qué hay que
hacer.

## Para qué existe

Pedido de Mauro, textual: que cuando un administrador detecta una falla quede
registrada **en un solo lugar**, para no tener que revisar varios sitios al
ponerse a hacer modificaciones.

Lo que reemplaza: contárselo por WhatsApp, que se pierde; o acordarse de
decírselo la próxima vez que se lo cruza, que se olvida.

## Cómo se usa

Avatar de arriba a la derecha → **Reportar una falla**. Está en las ocho páginas
del panel, porque la hoja de cuenta está en las ocho.

Tres campos y nada más:

| Campo | Por qué está |
|---|---|
| **¿Qué pasó?** | lo único obligatorio |
| **¿Qué esperabas que pasara?** | es lo que la gente se olvida de contar, y sin eso a veces no se entiende qué está mal |
| **¿Te deja trabajar?** | *molesta pero sigo* / *no puedo seguir*. Decide el orden en que se atiende |

La **página** se captura sola, y el nombre y el mail salen de la sesión. Pedir
algo que el sistema ya sabe es hacerle hacer trabajo a la persona.

## Por qué no escribe directo en el panel de Mauro

Es la pregunta obvia, y la respuesta es dura: **no se puede, y aunque se pudiera
no conviene.**

El panel de datos vive en **otro proyecto de Firebase** (`datos-830f8`). Un token
de Firebase Authentication sirve para **un** proyecto y nada más — es la misma
razón por la que el usuario del agente tiene cuatro UID distintos, uno por base.
Un administrador de remate, logueado en `remate-acbc9`, no puede escribir allá.

Para que pudiera habría que darle a **cada administrador de remate una cuenta en
la base donde Mauro guarda su bóveda** (`fichas/`, `claves/`). Eso no se hace:
hoy él es el único usuario de esa base, y eso es lo que hace que el sello valga.

Así que **cada uno reporta en su casa** y el agente los junta. El puente ya
existía: una sesión de Claude Code tiene un usuario en las cuatro bases.

## Cómo llegan al panel

```
remate-acbc9  →  reportes/          (esta base, esta colección)
                      ↓  los lee un agente, con `herramientas/firestore.mjs`
datos-830f8   →  pendientes/        (el panel de Mauro)
```

El pendiente que se crea lleva un campo `origen` con de dónde salió
(`remate:reportes/<id>`), así no se trae dos veces y se puede volver a la fuente.

**Y no caen en una pantalla aparte: caen en «Pendientes».** Una falla reportada
*es* un pendiente. Meterla en una solapa propia fragmentaría justamente lo que
este circuito viene a concentrar.

## El agente NO escribe en esta base

Lo lee y nada más. El bloque `esAgente()` de `firestore.rules` le da **lectura
sola**, y esta colección no es la excepción.

Podría haberse abierto para que marcara los reportes como `tomado` y no volver a
traerlos. Se resolvió del otro lado: el pendiente del panel guarda de qué reporte
salió, así que para saber qué es nuevo se mira **allá**. Mantener «el agente no
escribe en remate» vale más que esa comodidad.

## Las reglas

`firestore.rules` **v0.9**, bloque `reportes/{id}`. Tres decisiones que no son de
trámite:

- **El `uid` tiene que ser el de quien escribe.** Un reporte que puede mentir de
  quién vino no sirve para volver a preguntarle qué vio, y eso es la mitad de
  para qué existe un reporte.
- **Leerlos es de admin.** Un reporte se escribe sin pensar en quién lo va a
  leer, así que puede nombrar un cliente, una venta o un problema de dinero. Se
  lo trata como lo más sensible que podría contener.
- **`texto` y `uid` no se pueden cambiar.** Se cierra o se marca tomado; no se
  reescribe. Pisar lo que dijo una persona es perder el reporte, y es justo lo
  que nadie nota hasta que hace falta.

⚠ **La autoridad es lo publicado en la consola.** Este archivo es una copia, y
hay que pegarla: ver el pendiente `remate:L1` del panel.

## Lo que falta

- **El lado del panel**: que una sesión lea `reportes/` de las bases y abra el
  pendiente. Hoy hay que pedírselo; la idea es que entre en la rutina de apertura
  del § 8 del `PROTOCOLO-GENERAL.md`.
- **Casa Verde y CasaYourte**: el mismo formulario, la misma regla. Se hizo
  remate primero porque es el que tiene más gente además de Mauro.
- Harmonía no entra: no tiene base ni administradores.
