# F-001 · Contrato del protocolo v1

**Estado:** **aprobada** por el dueño el 2026-10-22 (puerta 1, con D1–D5) · en curso
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** `typebox` (D2): define los esquemas como JSON Schema y da los tipos de TypeScript; sin dependencias propias. El CRC32 sale de `node:zlib` (sin dependencia). Swagger UI y Prism corren por Docker (imágenes fijadas en `tools/images.conf`).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** ✅ | ¿Protocolo compatible con TRMNL? | **Aprobado (el dueño, 2026-10-22): protocolo propio de Tintero.** Un adaptador TRMNL se evalúa después | Con L1 (certificado por pantalla, ADR-0007) un aparato TRMNL comercial no puede conectarse igual; y la navegación B/C (índice, zonas, acciones) no existe en TRMNL. Copiar su forma no aporta y complica |
| **D2** ✅ | ¿Con qué se escriben los esquemas? | **Aprobado (el dueño, 2026-10-22): TypeBox** (`typebox` 1.4) | Sus esquemas **son** JSON Schema (el artefacto que sirve para el firmware y para terceros) y además dan los tipos de TypeScript. Alternativa: Zod 4 (más popular; convierte a JSON Schema) |
| **D4** ✅ | ¿Documentación tipo Swagger? | **Aprobado (el dueño, 2026-10-22): OpenAPI 3.1 generado desde los mismos esquemas** (`contract/openapi/v1.json`), visor **Swagger UI** y **servidor simulado** (Prism) para probar el firmware antes de que exista el servidor; todo por Docker, sin dependencias npm | Pedido del dueño (2026-10-22). OpenAPI 3.1 usa JSON Schema, así que los esquemas entran tal cual |
| **D5** ✅ | ¿Cómo sabe el servidor qué pantalla tiene cada aparato? | **Aprobado (el dueño, 2026-10-22): el aparato declara su panel** en cada petición (`Tintero-Panel`: ancho, alto, ppp y profundidad) y el servidor dibuja para ese panel; el índice repite el panel para que el aparato confirme. **Nada de 800 × 480 fijo en el contrato** | Observación del dueño (2026-10-22): cada pantalla tiene su tamaño y sus ppp, y se puede cambiar de pantalla después. Si el firmware declara el panel, cambiar de pantalla no toca ni el contrato ni el servidor: solo hay que volver a dibujar |
| **D3** ✅ | ¿Formato de imagen? | **Aprobado (el dueño, 2026-10-22): se empieza con `raw1` + CRC32.** `png1` queda descrito en el contrato para después; **nadie lo implementa todavía**. El aparato declara qué formatos acepta (`Tintero-Formats`) y el servidor solo manda esos | Medido: una vista de texto pesa 48 000 B en `raw1` y ~4–5 KB en `png1`. Se compara la batería en M9 antes de pasar a `png1` |

## Listo para programar
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato está escrito (abajo).
- [x] Archivos listados.
- [x] Presupuestos y reglas de seguridad nombrados.
- [x] Fuera de alcance escrito.

## Contexto
La API de aparatos (ADR-0006: navegación B con C progresiva; ADR-0004: HTTPS; ADR-0005: dos botones) necesita un **contrato versionado** (M2, ADR-0017) que compartan el servidor (F-003), el emulador (F-002) y el firmware del dueño (ADR-0013). Esta ficha escribe ese contrato como **esquemas + validadores + archivos de ejemplo**, sin servidor.

## Alcance
- Esquemas TypeBox y tipos de TypeScript de todos los mensajes de v1.
- Validadores que además comprueban las reglas que un esquema no expresa (tamaños, ids repetidos, zonas dentro del panel).
- **El panel no es fijo:** el aparato lo declara y todas las reglas de tamaño se calculan con él. Así, cambiar de pantalla no cambia el contrato.
- Comprobación de imágenes `png1` y `raw1`.
- Archivos JSON Schema generados (para el firmware y para terceros) y un control de que no se desactualicen.
- Ejemplos válidos e inválidos (`contract/fixtures/v1/`) que **siempre** deben seguir validando igual (compatibilidad, M2).

**Fuera de alcance:** la implementación de `png1` en cualquier lado; que la pantalla real (en la LAN) alcance el simulador (se decide cuando el dueño empiece el firmware: hace falta HTTPS); el servidor HTTP, la autenticación (mTLS/L1 llega en F-004: aquí solo se dice qué pasa sin ella), el render de vistas, el emulador, un adaptador TRMNL.

## Contrato

### Reglas generales
- Prefijo: `/api/v1`. Todo por HTTPS (ADR-0004). JSON en UTF-8.
- **Una petición a la vez:** el aparato nunca hace peticiones en paralelo; el servidor no debe asumirlo.
- **Compatibilidad hacia adelante:** quien recibe un mensaje **ignora los campos que no conoce** (en cuerpos y cabeceras).
- **Reglas de versión (M2):** dentro de v1 solo se **agregan** campos opcionales; nunca se quitan, renombran ni cambian de tipo. Un cambio que rompa va en `/api/v2`, servido en paralelo. Los ejemplos de `contract/fixtures/v1/` no se modifican: solo se agregan.
- **Sin autenticación válida**, cualquier ruta responde **404 sin cuerpo**, igual que una ruta inexistente (L3). El mecanismo de autenticación lo define F-004.
- El servidor manda **JSON compacto** (sin espacios). Peores casos válidos: índice con 16 vistas ≈ 1,6 KB; 48 zonas ≈ 3 KB: los límites de bytes dejan margen para campos futuros.
- Identificadores (`id` de vista, zona, acción): `^[a-z0-9_-]{1,16}$` (acciones: `^[a-z0-9_-]{8,24}$`). Huellas (`hash`): `^[0-9a-f]{8,16}$`. Tiempos: segundos Unix, enteros.

### Límites (`LIMITS`)
| Nombre | Valor |
|--------|-------|
| Panel (lo declara el aparato) | ancho y alto 8–2048 px; ppp 50–400; profundidad 1 bit en v1 (2 bits = 4 grises, después) |
| `maxIndexBytes` | 2048 (índice serializado) |
| `maxZonesBytes` | 4096 (zonas de una vista, serializadas) |
| `maxViews` | 16 |
| `maxZones` | 48 por vista |
| `minZoneSize` | 8 px (ancho y alto) |
| `maxImageBytes` | 1 048 576 (el máximo de `raw1` para un panel de 2048 × 2048 es 524 288) |
| Bytes de `raw1` | `ceil(ancho / 8) × alto` (cada fila empieza en un byte nuevo). Panel actual GDEY075T7: 100 × 480 = **48 000** |
| `minWakeS` … `maxWakeS` | 30 … 86 400 |
| `maxActions` | 8 por petición |
| `maxLogEntries` / `maxLogMsg` | 10 / 200 caracteres |

### Cabeceras que manda el aparato
| Cabecera | Valor | Obligatoria |
|----------|-------|-------------|
| `Tintero-Protocol` | `1` | sí |
| `Tintero-Firmware` | texto, 1–32 caracteres | sí |
| `Tintero-Power` | `battery` \| `usb` | sí |
| `Tintero-Battery-mV` | entero 2500–4500 | no |
| `Tintero-RSSI` | entero −120–0 | no |
| `Tintero-Formats` | lista separada por comas de `raw1`, `png1` (al menos uno) | sí |
| `Tintero-Panel` | `w=<ancho>,h=<alto>,dpi=<ppp>,depth=<bits>`, p. ej. `w=800,h=480,dpi=124,depth=1` (el GDEY075T7: 124,39 ppp, se redondea) | sí |

Los nombres no distinguen mayúsculas. El servidor responde siempre con `Tintero-Protocol: 1`.

### `GET /api/v1/index` → `IndexResponse`
```json
{
  "protocol": 1,
  "server_time": 1761096000,
  "next_wake_s": 1800,
  "full_refresh": false,
  "panel": { "w": 800, "h": 480, "dpi": 124, "depth": 1 },
  "current": "todo",
  "views": [
    { "id": "todo", "hash": "9f2c1a7b", "format": "raw1", "bytes": 48000, "crc32": "3a1f09c4" },
    { "id": "agenda", "hash": "41d0e2aa", "format": "raw1", "bytes": 48000, "crc32": "b7e2d150" }
  ]
}
```
- `views`: 1–16, **ids sin repetir**, en el orden en que se recorren con Mover largo.
- `current` **debe** ser uno de los `views[].id`.
- `bytes`: 1–1 048 576; si `format` es `raw1`, **exactamente** `ceil(w / 8) × h` del `panel` (48 000 para 800 × 480).
- `crc32`: obligatorio, 8 dígitos hexadecimales en minúscula: el **CRC-32 estándar** (el de zlib y PNG; valor de control: `"123456789"` → `cbf43926`) de los bytes de la imagen tal como se descargan. El aparato lo comprueba antes de guardar o mostrar.
- `format` de cada vista: uno de los que el aparato declaró en `Tintero-Formats`.
- `next_wake_s`: 30–86 400.
- `panel`: el panel **para el que se dibujaron las vistas**; debe ser igual al que el aparato declaró en `Tintero-Panel`. Si no coincide (p. ej. se cambió la pantalla y el servidor todavía no redibujó), el aparato no muestra nada nuevo y vuelve a pedir el índice en `next_wake_s`.
- Serializado: **≤ 2048 bytes**.

### `GET /api/v1/views/{id}/image?h={hash}` → bytes de la imagen
- `png1`: `Content-Type: image/png`. PNG en **escala de grises, profundidad 1 bit, sin entrelazado**, exactamente del ancho y alto del `panel`.
- `raw1`: `Content-Type: application/octet-stream`. **`ceil(w / 8) × h` bytes** (48 000 en el panel actual): filas de arriba abajo, píxeles de izquierda a derecha, **el bit más significativo primero**, **1 = negro**; si el ancho no es múltiplo de 8, los bits sobrantes al final de cada fila van en 0.
- `ETag: "<hash>"`; con `If-None-Match` igual a la huella → **304**. Si `h` ya no es la huella actual → **409** `stale_view` (el aparato vuelve a pedir el índice).

### `GET /api/v1/views/{id}/zones?h={hash}` → `ZonesResponse`
```json
{
  "view": "todo",
  "hash": "9f2c1a7b",
  "zones": [
    { "id": "t1", "x": 24, "y": 72, "w": 752, "h": 40, "act": "toggle" },
    { "id": "t2", "x": 24, "y": 120, "w": 752, "h": 40, "act": "toggle" },
    { "id": "ev1", "x": 24, "y": 400, "w": 360, "h": 56, "act": "open" }
  ]
}
```
- `zones`: 0–48, **en el orden de `Tab`**, ids sin repetir.
- `act`: `toggle` (marcar o desmarcar) \| `open` (abrir el detalle).
- Cada zona **dentro del panel** (`x + w ≤ panel.w`, `y + h ≤ panel.h`, `x, y ≥ 0`) y con `w, h ≥ 8`.
- Serializado: **≤ 4096 bytes**. Mismo `409 stale_view` que la imagen.

### `POST /api/v1/actions` — `ActionsRequest` → `ActionsResponse`
```json
{ "actions": [ { "id": "a7f3c9e2b1", "view": "todo", "zone": "t2", "act": "toggle", "at": 1761096123 } ] }
```
```json
{ "results": [ { "id": "a7f3c9e2b1", "status": "applied" } ], "index_changed": true }
```
- 1–8 acciones (la cola de acciones hechas sin red se manda junta).
- **Idempotente por `id`:** la misma acción dos veces se aplica una sola; la segunda responde `duplicate`.
- `status`: `applied` \| `duplicate` \| `stale` (la zona o la vista ya no existe).

### `POST /api/v1/log` — `LogRequest` → `204`
```json
{ "entries": [ { "at": 1761096200, "level": "warn", "msg": "wifi tardó 9 s" } ] }
```
- 1–10 entradas; `level`: `error` \| `warn` \| `info`; `msg`: 1–200 caracteres.

### Errores (aparato autenticado) — `ErrorBody`
```json
{ "error": { "code": "stale_view", "msg": "la vista cambió; pide el índice" } }
```
| HTTP | `code` |
|------|--------|
| 400 | `invalid_request` |
| 404 | `unknown_view` |
| 409 | `stale_view`, `stale_zone` |
| 413 | `too_large` |
| 429 | `too_many` (con `Retry-After` en segundos) |
| 503 | `busy` (con `Retry-After`) |

`msg`: 0–200 caracteres. Para un aparato **no autenticado** no hay cuerpo (404 vacío).

### Interfaz del módulo (`contract/src/index.ts`)
```ts
export const PROTOCOL_VERSION = 1;
export const LIMITS: { /* tabla de Límites, con esos nombres */ };

// Tipos (derivados de los esquemas TypeBox)
export type Panel /* { w, h, dpi, depth } */, IndexResponse, ViewSummary, ZonesResponse, Zone, ActionsRequest, Action,
  ActionsResponse, ActionResult, LogRequest, LogEntry, ErrorBody, DeviceHeaders;

export type ContractErrorCode =
  | "invalid_json" | "schema" | "too_large" | "duplicate_id"
  | "unknown_current" | "out_of_panel" | "raw1_size" | "bad_image" | "crc_mismatch";
export interface ContractError { path: string; code: ContractErrorCode }
export type Validation<T> = { ok: true; value: T } | { ok: false; errors: ContractError[] };

// Reciben el JSON como texto (para poder medir su tamaño)
export function validateIndex(raw: string): Validation<IndexResponse>;
export function validateZones(raw: string, panel: Panel): Validation<ZonesResponse>;
export function validateActionsRequest(raw: string): Validation<ActionsRequest>;
export function validateActionsResponse(raw: string): Validation<ActionsResponse>;
export function validateLogRequest(raw: string): Validation<LogRequest>;
export function validateErrorBody(raw: string): Validation<ErrorBody>;
export function validateDeviceHeaders(headers: Record<string, string | undefined>): Validation<DeviceHeaders>;
export function checkImage(format: "png1" | "raw1", bytes: Uint8Array, panel: Panel, crc32?: string): Validation<Uint8Array>;
export function raw1Bytes(panel: Panel): number;      // ceil(w / 8) × h
export function parsePanelHeader(value: string): Validation<Panel>;
export function formatPanelHeader(panel: Panel): string;
export function crc32Hex(bytes: Uint8Array): string;   // CRC-32 estándar en 8 dígitos hex minúscula
export const openApiDocument: object;                  // OpenAPI 3.1 de v1 (lo que se escribe en contract/openapi/v1.json)
```
- `path`: ruta tipo JSON Pointer (`/views/1/id`, `/zones/0`), o `""` para el documento entero.
- Códigos: JSON ilegible → `invalid_json`; no cumple el esquema → `schema`; pasa el límite de bytes → `too_large`; id repetido → `duplicate_id`; `current` no está en `views` → `unknown_current`; zona fuera del panel → `out_of_panel`; `raw1` con `bytes` distinto de `raw1Bytes(panel)` → `raw1_size`; imagen que no cumple el formato → `bad_image`; CRC que no coincide → `crc_mismatch`.
- Si hay varios errores, se devuelven **todos** los que se puedan detectar.

### Cómo se usa el panel (fuera de esta ficha; queda escrito para F-005)
- Los diseños se definen en **unidades físicas** (milímetros o puntos tipográficos) y el motor de vistas las convierte a píxeles con los `dpi` del panel: en el GDEY075T7 (≈ 124 ppp), 1 mm ≈ 4,9 px. Así, una letra de 3 mm se ve del mismo tamaño en cualquier pantalla.
- Ancho y alto deciden la **distribución** (cuántos bloques caben); la profundidad, si hay grises.
- Si un aparato declara un panel distinto al que tenía (se cambió la pantalla), el servidor **redibuja todas sus vistas** para el panel nuevo. Ningún cambio al contrato ni al firmware de otros aparatos.

## Requisitos
- R1. Esquemas en `contract/src/` con TypeBox; los tipos se derivan de ellos (no se escriben dos veces).
- R2. `npm run contract:schema` genera `contract/schema/v1/*.schema.json` (index, zones, actions-request, actions-response, log-request, error); `npm run contract:check` falla si están desactualizados.
- R3. `contract/fixtures/v1/valid/<mensaje>-<detalle>.json` e `invalid/<mensaje>-<code>-<detalle>.json`, donde `<mensaje>` es `index`, `zones`, `actions-request`, `actions-response`, `log-request` o `error` (dice qué validador aplica) y `<code>` es el código esperado. Las zonas se validan con el panel 800 × 480. Probados por pruebas unitarias. *(Aclaración del 2026-10-22, pedida por el verificador.)*
- R4. `contract/README.md` (primera línea descriptiva, para el mapa) con cómo usar el contrato desde otro lenguaje (JSON Schema), cómo abrir el visor y cómo usar el simulador.
- R5. **OpenAPI 3.1** en `contract/openapi/v1.json`, generado desde los mismos esquemas por `npm run contract:schema` y comprobado por `contract:check`. Describe las 5 rutas, las cabeceras, las respuestas (incluidas las binarias y los errores), los ejemplos de esta ficha y la seguridad como `mutualTLS` (L1).
- R6. **Visor:** `npm run contract:docs` levanta Swagger UI (imagen `SWAGGER_UI_IMAGE` de `tools/images.conf`) en `127.0.0.1:8099` sirviendo `contract/openapi/v1.json`. **Simulador:** `npm run contract:mock` levanta Prism (`PRISM_IMAGE`) en `127.0.0.1:4010`. Los dos se detienen con Ctrl+C y no publican nada fuera de `127.0.0.1`.

## Criterios de aceptación
- **CA1.** El ejemplo de `IndexResponse` de esta ficha **valida** (`ok: true`).
- **CA2.** `validateIndex` rechaza, cada uno con su código: un id de vista repetido (`duplicate_id`); `current` que no está en `views` (`unknown_current`); 17 vistas (`schema`); un id con mayúsculas (`schema`); `next_wake_s` = 10 (`schema`); `format: "raw1"` con `bytes: 47999` (`raw1_size`); texto que no es JSON (`invalid_json`).
- **CA3.** Un `IndexResponse` con forma válida pero de **más de 2048 bytes** serializado se rechaza con `too_large`.
- **CA4.** El ejemplo de `ZonesResponse` valida con el panel 800 × 480. Se rechazan: una zona con `x: 700, w: 120` (`out_of_panel`); una con `w: 4` (`schema`); ids de zona repetidos (`duplicate_id`); 49 zonas (`schema`); `act: "delete"` (`schema`).
- **CA5.** `validateActionsRequest` acepta 1 y 8 acciones y rechaza 0 y 9 (`schema`); rechaza un `id` de acción de 5 caracteres (`schema`). `validateActionsResponse` acepta el ejemplo y rechaza `status: "ok"` (`schema`).
- **CA6.** `validateLogRequest` acepta el ejemplo; rechaza 11 entradas y un `msg` de 201 caracteres (`schema`).
- **CA7.** `validateErrorBody` acepta los 7 códigos de la tabla y rechaza `"code": "teapot"` (`schema`).
- **CA8.** `validateDeviceHeaders` acepta cabeceras con nombres en minúsculas o mayúsculas; rechaza la falta de `Tintero-Power` y `Tintero-Battery-mV: 9000` (`schema`); ignora cabeceras desconocidas.
- **CA9.** Campos desconocidos en cualquier cuerpo **se aceptan** (compatibilidad hacia adelante) y **no aparecen** en tipos inventados; un JSON con la clave `"__proto__"` no modifica `Object.prototype`.
- **CA10.** Con el panel 800 × 480, `checkImage("raw1", …)` acepta exactamente 48 000 bytes y rechaza 47 999 (`bad_image`). `checkImage("png1", …)` acepta un PNG de 800 × 480, gris, 1 bit, sin entrelazado; rechaza 800 × 479, profundidad 8, entrelazado y bytes que no son PNG (`bad_image`).
- **CA11.** `npm run contract:check` pasa con los JSON Schema generados y **falla** si se edita a mano uno de ellos.
- **CA17 (otros paneles).** `raw1Bytes` da 48 000 para 800 × 480, **38 880 para 648 × 480** (5,83″) y **4 000 para 122 × 250** (ancho no múltiplo de 8: 16 bytes por fila). Un índice con `panel` 648 × 480 y una vista `raw1` de 38 880 bytes **valida**; la misma vista con 48 000 se rechaza (`raw1_size`). Con el panel 648 × 480, una zona con `x: 600, w: 60` se rechaza (`out_of_panel`).
- **CA18.** `parsePanelHeader("w=800,h=480,dpi=124,depth=1")` da `{ w: 800, h: 480, dpi: 124, depth: 1 }` y `formatPanelHeader` lo devuelve igual; se rechazan `w=4,…` (ancho < 8), `dpi=20`, `depth=3` y un texto mal formado (`schema`). `validateDeviceHeaders` exige `Tintero-Panel`.
- **CA12.** Todos los `contract/fixtures/v1/valid/*` validan y todos los `invalid/*` fallan con el código de su nombre.
- **CA13.** `crc32Hex` de los bytes ASCII de `"123456789"` es `"cbf43926"`. `checkImage("raw1", bytes, crc)` acepta el CRC correcto y rechaza uno distinto con `crc_mismatch`. `validateIndex` rechaza una vista sin `crc32` y una con `crc32: "XYZ"` (`schema`).
- **CA14.** `validateDeviceHeaders` acepta `Tintero-Formats: raw1` y `raw1,png1`; rechaza la falta de `Tintero-Formats`, una lista vacía y `bmp` (`schema`).
- **CA15.** Con `npm run contract:mock` corriendo: `GET http://127.0.0.1:4010/api/v1/index` **con** las cabeceras obligatorias devuelve un cuerpo que pasa `validateIndex`; **sin** `Tintero-Power` el simulador rechaza la petición (código 4xx). `GET …/views/todo/zones?h=9f2c1a7b` devuelve un cuerpo que pasa `validateZones`.
- **CA16.** Con `npm run contract:docs` corriendo, `GET http://127.0.0.1:8099/` responde 200, la especificación responde 200 en **`http://127.0.0.1:8099/v1.json`** y el visor apunta a esa URL. *(URL aclarada el 2026-10-22.)*

## Presupuestos
- `validateIndex` sobre un índice de 2048 bytes: **< 5 ms** de promedio en 1000 corridas.
- El simulador y el visor arrancan en **< 30 s** con las imágenes ya descargadas.
- El módulo `contract/` no depende de nada salvo `typebox` y Node.

## Seguridad
- S6: los validadores **no registran** el contenido que reciben.
- I5 / minimización: los tipos solo exponen los campos del contrato.
- Sin `eval` ni `new Function` en código propio (usar `Value.Check`/`Value.Errors` de TypeBox, no su compilador).
- `contract/**` pasa a ser **zona sensible** (lo agrega el arquitecto a `tools/sensitive-paths.txt` antes de programar).

## Archivos
- A crear: `contract/README.md`, `contract/src/*.ts` (esquemas, límites, validadores, imágenes, CRC, OpenAPI, `index.ts`), `contract/src/*.test.ts`, `contract/schema/v1/*.schema.json` y `contract/openapi/v1.json` (generados), `contract/fixtures/v1/{valid,invalid}/*.json`, `contract/scripts/` (generar/comprobar esquemas; levantar visor y simulador leyendo `tools/images.conf`).
- A tocar: `package.json` (dependencia y scripts `contract:schema`, `contract:check`), `tsconfig.json` (incluir `contract`), `knip.json` (entradas).

## Resultado esperado
`import { validateIndex } from "../contract/src/index.ts"` funciona en el servidor y en el emulador; el firmware del dueño puede validar sus mensajes con `contract/schema/v1/*.schema.json`; y cualquier cambio que rompa v1 hace fallar las pruebas de compatibilidad.

## Terminado
- [ ] Todos los CA pasan en la verificación.
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados.
- [ ] `check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Se llena al cerrar.)*

## Resumen para aprobar
*(Se llena al cerrar.)*
