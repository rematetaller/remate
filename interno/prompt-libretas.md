# Prompt para extraer libretas de propiedad (Uruguay)

Se pega en el chat de Gemini junto con **una o varias fotos** de libretas. Devuelve un
array JSON, un objeto por libreta, listo para la carga masiva.

Guardar este archivo en el repositorio: el prompt es parte del sistema aunque no sea
código. Si cambia el esquema, cambia acá.

---

## El prompt

```
Sos un transcriptor de documentos. Te paso fotos de libretas de propiedad de vehículos
de Uruguay. Devolvé UN array JSON, un objeto por foto, en el mismo orden en que te las
mandé. Nada más: sin explicaciones, sin texto antes ni después, sin ``` alrededor.

REGLAS QUE NO SE NEGOCIAN:

1. Transcribí EXACTAMENTE lo que ves, carácter por carácter, incluidos espacios y
   guiones. No normalices, no completes, no corrijas.
2. Si un campo no está en el papel o está vacío, poné null. NUNCA inventes ni deduzcas
   un valor: un campo vacío es correcto, un campo inventado es un error grave.
3. Si un carácter te genera duda (O contra 0, I contra 1, S contra 5, B contra 8),
   transcribí lo que más se parece y agregá el nombre del campo al array "dudas".
   NO lo corrijas por tu cuenta, ni siquiera si conocés la regla del estándar.
4. Los números de motor y chasis son lo más importante del documento. Revisalos dos
   veces antes de responder.
5. Cualquier dato que esté en el papel y no tenga lugar en el esquema va dentro de
   "extra", con el nombre que usa el papel.

Esquema de cada objeto:

{
  "emisor": "intendencia o departamento que emitió, si se puede ver; si no, null",
  "matricula": "tal como aparece, con espacio si lo tiene",
  "padron": null,
  "codigoNacional": null,
  "divNro": null,
  "afectacion": null,
  "vehiculo": {
    "marca": null,
    "modelo": null,
    "anio": null,
    "tipo": null,
    "atributo": null,
    "cilindros": null,
    "cilindrada": null,
    "combustible": null,
    "pbtKg": null,
    "ejes": null,
    "pasajeros": null,
    "nroMotor": null,
    "nroChasis": null
  },
  "titulares": [
    { "nombre": "como figura, apellidos primero si así está", "ciRut": null }
  ],
  "cantidadTitulares": null,
  "leasing": null,
  "observaciones": null,
  "empadronado": "fecha como está escrita, ej 03/06/24",
  "emitido": "fecha como está escrita",
  "extra": {},
  "dudas": []
}

Los campos numéricos (anio, cilindros, cilindrada, pbtKg, ejes, pasajeros,
cantidadTitulares) van como número, sin unidades. El resto como texto.
```

---

## Ejemplo de salida verificada

Sale de la libreta de muestra (Montevideo, triciclo Chetak Cargo 2012):

```json
[{
  "emisor": "Intendencia de Montevideo",
  "matricula": "SNS 805",
  "padron": "903797817",
  "codigoNacional": "903797817",
  "divNro": "3401441",
  "afectacion": "PARTICULAR",
  "vehiculo": {
    "marca": "INTERPARTES",
    "modelo": "CHETAK CARGO",
    "anio": 2012,
    "tipo": "TRICICLO",
    "atributo": null,
    "cilindros": 1,
    "cilindrada": 200,
    "combustible": "NAFTA",
    "pbtKg": 500,
    "ejes": 2,
    "pasajeros": 1,
    "nroMotor": "163ML120810010",
    "nroChasis": "L1PGHKK2XC0810010"
  },
  "titulares": [{ "nombre": "GASTALDELLO FRAGA, MAURO", "ciRut": "3857637-0" }],
  "cantidadTitulares": 1,
  "leasing": null,
  "observaciones": null,
  "empadronado": "03/06/24",
  "emitido": "03/06/24",
  "extra": {},
  "dudas": []
}]
```

---

## Cómo se usa

1. Sacar las fotos de las libretas. Con luz parcial en el plástico, sacar dos: el
   reflejo tapa un renglón distinto en cada una.
2. Pegar el prompt en el chat de Gemini y adjuntar las fotos. De cinco en cinco: si son
   muchas, se confunde el orden y se hace imposible saber qué objeto es qué papel.
3. Copiar el JSON.
4. Pegarlo en la pantalla de carga de `documentos.html` (pendiente de construir), que va
   a mostrar cada registro para confirmar antes de guardar, con la foto al lado.

## Lo que el sistema hace después, y por qué

- **Los identificadores se guardan tal como están en el papel.** La libreta es la
  evidencia; sacarle los espacios al guardar es perder fidelidad con el documento. La
  canonización (mayúsculas, sin espacios ni guiones) se hace en memoria al buscar.
- **Los campos marcados en `dudas` se resaltan** en la pantalla de confirmación. Es la
  única razón por la que ese array existe.
- **Cada carga guarda la foto** en Cloudinary y queda pegada al registro. Un número sin
  su foto no se puede auditar después.
- **Nada de esto va a `productos`**, que es de lectura pública. Los titulares y los
  números de motor y chasis viven en colecciones que solo leen usuarios activos.
