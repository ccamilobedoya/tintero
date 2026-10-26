# Integraciones

[Read in English](../en/integrations.md)

Una **integración** lee un servicio externo cada cierto tiempo y le da al motor de vistas una **fuente** (una lista de tareas, eventos o festivos). Nunca dibuja nada y nunca ve tus llaves. Esta página explica el modelo, muestra un ejemplo resuelto (`festivos`) y da una plantilla que puedes copiar (`example-json`).

## Cómo funciona una integración

- **«La integración pide, el núcleo concede».** Cada integración declara un *manifiesto*: a qué servidor puede llamar (`"configured"` significa solo la dirección que pones en la configuración), qué métodos y rutas, si necesita llave, si puede escribir y cada cuánto lee. El cliente HTTP vigilado rechaza todo lo demás **sin hacer la llamada**.
- **Un solo cliente HTTP.** Todas las integraciones pasan por `server/src/integrations/http.ts`, el único lugar que llama a `fetch`. Guarda la llave (la integración no la ve), acepta `https` (y `http://127.0.0.1` para tus propios servicios locales), rechaza las redirecciones, limita el tiempo y el **tamaño de la respuesta antes de interpretarla**, y registra cada llamada sin contenido.
- **Solo lectura por defecto.** Escribir es un permiso que el manifiesto debe pedir.
- **Consulta, no recibe.** Nada entra desde internet. La integración lee cada `pollS` segundos y, si una lectura falla, el motor conserva los últimos datos buenos y un bloque con título puede decir `sin datos desde HH:MM`.

## Un ejemplo resuelto: `festivos`

`festivos` es la integración real más simple: festivos oficiales de [Nager.Date](https://date.nager.at), sin llave, solo `GET`. Léela en `server/src/integrations/holidays-nager.ts`.

- **Manifiesto** (`manifest.ts`): `needsKey: false`, `writes: false`, una ruta `GET /api/v3/PublicHolidays/`, `pollS: 3600`. Solo salen el año y el país.
- **Límites:** la respuesta y el archivo de caché tienen un tope de 64 KiB (`HOLIDAYS_HTTP_LIMITS`).
- **`parseNager(json)`:** conserva solo los festivos públicos y de todo el país, comprueba cada fecha con `validDate`, corta cada nombre a 60 caracteres y descarta cualquier otro campo. Una forma incorrecta lanza `bad-json`.
- **Ciclo:** lee el año local (y el siguiente desde el 1 de diciembre), guarda cada año en un archivo con permisos 600 por 30 días, reintenta una hora después de un error y trata un `404` como «país desconocido» por 24 horas. Nunca bloquea el dibujo ni el arranque.
- **Configuración:** una entrada `festivos` en el archivo de integraciones (`baseUrl` y, opcional, `stateFile`) más `holidays.country` en el archivo de vistas.
- **Los registros** llevan el año, el estado y conteos, nunca los nombres de los festivos.

## La plantilla: `example-json`

`example-json` es una integración pequeña hecha para copiarse. Hace un `GET` a `<baseUrl>/tasks.json` por `https`, sin llave, sin redirecciones y con una respuesta de 64 KiB como máximo, y le da al motor una fuente `tasks` de solo lectura. Está **apagada** mientras el archivo de integraciones no la configure. Los archivos:

| Archivo                                        | Qué contiene                                                          |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `server/src/integrations/example-json.ts`      | La integración: límites, `parseExampleTasks`, `createExampleJson`     |
| `server/src/integrations/example-json.test.ts` | Sus pruebas                                                           |
| `server/src/integrations/manifest.ts`          | `exampleJsonManifest`                                                 |
| `server/src/integrations/config.ts`            | Su configuración en el archivo de integraciones                       |
| `server/src/main.ts`                           | Dónde se crea, se arranca y se detiene                                |
| `config/example-json.*.example.json`           | Archivos de ejemplo de vistas, datos e integraciones                  |

El JSON que espera es una lista de 100 elementos como máximo; cualquier otro campo se descarta:

```json
[{ "id": "a1", "title": "Regar las plantas", "done": false, "due": "2026-10-30" }]
```

La configuración (con tu propio servidor, por `https`):

```json
{
  "version": 1,
  "integrations": {
    "example-json": { "source": "remote", "baseUrl": "https://example.com/tintero" }
  }
}
```

## Paso a paso: tu propia integración

Digamos que quieres leer `https://example.com/tintero/events.json`. Copia `example-json` y cámbiala con estos pasos.

### 1. El manifiesto

En `manifest.ts`, agrega un `Manifest` con un `id` y una `version` nuevos, lo que entrega (`delivers`: `tasks`, `events` o `holidays`), `hosts: "configured"`, `needsKey` (usa `false` para un archivo público), `writes: false` y `pollS`. Deja las `routes` lo más estrechas que puedas:

```ts
routes: [{ method: "GET", prefix: "/events.json" }],
```

### 2. Rutas permitidas y límites

En tu archivo, nombra la única ruta que lees (`EXAMPLE_JSON_PATH`) y fija los límites con que se construye el cliente vigilado, como `{ maxBytes: 65_536, timeoutMs: 5000 }`. La respuesta se corta en `maxBytes` **mientras se lee**, antes de que nadie la interprete. Elige el número más chico que quepa en la respuesta real.

### 3. La función `parse…`

Escribe una función (como `parseExampleTasks`) que reciba el JSON ya interpretado y devuelva tu lista tipada. Reglas: comprueba el tipo de **cada** campo, limita la cantidad de elementos y el largo de cada texto, revisa ids y fechas, y descarta los campos que no conozcas. Si **algo** está mal, lanza `IntegrationHttpError("bad-json")`: un solo campo malo rechaza toda la respuesta, así nada a medio revisar llega al motor.

### 4. El ciclo

Escribe `createTuIntegracion({ http, source, engine, clock, log })` con `start()`, `cycle()`, `idle()` y `stop()`. En cada ciclo: llama `http.request("GET", RUTA)`, pasa el resultado por tu función `parse`, y luego `engine.setSource(source, items, { readAt })`. Ante un error, solo registra un código (y un estado): el motor conserva los datos anteriores. Nunca registres títulos, direcciones con secretos ni cuerpos de respuesta. Copia la pequeña cola de `example-json.ts` para que `stop()` espere una lectura en curso.

### 5. La configuración en `config.ts`

En `server/src/integrations/config.ts`: agrega una interfaz para tu configuración y súmala a `IntegrationsFile`; agrega su nombre a la lista de claves permitidas de `parseIntegrations`; escribe un `parseTuIntegracion` que valide cada campo (solo `https`, como hace `parseExampleJson`); y, en `checkAgainstData`, comprueba que la fuente que nombra la configuración exista en el archivo de datos con el tipo correcto y `readonly`.

### 6. Regístrala en `main.ts`

En `server/src/main.ts`: cuando la configuración tenga tu entrada, construye el cliente con `guardedHttp(parseBase(baseUrl), undefined, tuManifiesto, { ...TUS_LIMITES, log })`, crea tu integración con el `engine` y llama a `start()`. Agrega un paso a `steps()` para que se detenga antes que el motor al apagar.

### 7. Las pruebas

Junto a tu código, en `tuintegracion.test.ts`. Usa un servidor falso mínimo en `127.0.0.1` (mira `startFake()` en `example-json.test.ts`) y un `engine` falso que anote `setSource`. Cubre al menos:

- una respuesta del límite más 1 byte falla **antes de interpretarse** y no entrega nada;
- una redirección es un error y no se sigue;
- una dirección `http:` en la configuración da un `ConfigError`;
- un campo de tipo incorrecto nunca llega al motor;
- el manifiesto no permite otra ruta ni escribir.

Después agrega archivos de ejemplo en `config/` con valores de relleno (`example.com`) y corre `npm run typecheck && npm run lint && npm test && npm run format:check`.

## Probarla

Sirve un `tasks.json` desde cualquier dirección `https` que controles, pon esa dirección en un archivo de integraciones (fuera del repositorio) y arranca el servidor con `--integrations`:

```bash
npm run server -- --port 8790 \
  --views config/example-json.views.example.json \
  --data config/example-json.data.example.json \
  --integrations /path/to/integrations.json
```

La lista `remote` en la pantalla muestra las tareas. Si la dirección deja de responder, la lista conserva las últimas tareas buenas.
