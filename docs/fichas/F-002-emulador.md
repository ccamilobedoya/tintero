# F-002 · Emulador de pantalla

**Estado:** borrador (espera la puerta 1 del dueño) · 2026-10-22
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna (HTTP con `node:http`/`node:https`, PNG con `node:zlib`).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** | ¿Cómo sabe el aparato que está en un **detalle**, para que «Aceptar largo» vuelva (ADR-0005)? | Campo **opcional** `parent` en cada vista del índice (id de la vista a la que se vuelve). Volver es **local, sin red**. Es un cambio **aditivo** de v1 (M2): los aparatos que no lo conocen lo ignoran | La alternativa (una acción `back` al servidor) gasta WiFi en cada vuelta atrás |
| **D2** | ¿El emulador estima batería? | **No.** Reporta peticiones, bytes y conexiones por despertada; la energía se mide con la placa real | Un número inventado de consumo engañaría más de lo que ayuda |
| **D3** | ¿Dibuja la marca ✓ optimista al aceptar una tarea? | **No en F-002:** manda la acción y muestra la vista que devuelva el servidor. La marca optimista queda para el firmware | Mantiene el emulador simple y fiel al contrato |
| **D4** | ¿Cómo se ve lo que «muestra» el emulador? | Un archivo **`screen.png`** (y `screen.raw1`) en su carpeta de almacenamiento. Una vista web en vivo, después si hace falta | Se abre con cualquier visor de imágenes, también desde el celular |

## Listo para programar
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaz, almacenamiento, informes, errores) está escrito.
- [x] Archivos listados.
- [x] Presupuestos y reglas de seguridad nombrados.
- [x] Fuera de alcance escrito.
- [x] Nombres de archivos, rutas, puertos y URLs escritos (las pruebas levantan su propio servidor en `127.0.0.1` con puerto efímero).

## Contexto
El emulador es un programa que **se porta como el ESP32** según el contrato v1 (F-001), la navegación B con C progresiva (ADR-0006), los dos botones (ADR-0005) y el panel declarado (D5 de F-001). Sirve para tres cosas: probar el servidor completo sin la placa (F-003 en adelante), probar contra el simulador Prism (ADR-0021), y ser la **referencia ejecutable** del comportamiento que tendrá el firmware del dueño (ADR-0013).

## Alcance
- Una **despertada** completa (índice, acciones pendientes, descargas en orden con presupuesto, CRC, almacenamiento con tope de flash, pantalla, registro).
- Los **cuatro toques** (`tab`, `long-tab`, `ok`, `long-ok`).
- **Cola de acciones** sin red, que se manda en la despertada siguiente.
- La salida de pantalla como `screen.png` y `screen.raw1`.
- Una **CLI** para usarlo a mano o desde scripts.
- El cambio aditivo del contrato para `parent` (D1).

**Fuera de alcance:** certificado de cliente / mTLS (F-004; el cliente HTTP queda preparado para recibir opciones TLS); estimar energía (D2); la marca ✓ optimista (D3); dormir en tiempo real (la CLI encadena despertadas sin esperar); `png1` (ADR-0020: solo `raw1`); una vista web.

## Contrato

### Cambio aditivo de v1 (D1)
- `ViewSummary` acepta un campo **opcional** `parent`: id de otra vista del mismo índice (`^[a-z0-9_-]{1,16}$`).
- `validateIndex` lo rechaza con el código nuevo **`unknown_parent`** si no existe en `views` o si es la misma vista.
- Se actualizan `contract/schema/v1/index.schema.json` y `contract/openapi/v1.json` (generados) y se **agregan** ejemplos: `contract/fixtures/v1/valid/index-parent-detail.json`, `contract/fixtures/v1/invalid/index-unknown_parent-missing.json`, `contract/fixtures/v1/invalid/index-unknown_parent-self.json`. **Ningún ejemplo existente cambia** (M2).

### Interfaz (`emulator/src/index.ts`)
```ts
import type { Panel, Zone } from "../../contract/src/index.ts";

export interface EmulatorConfig {
  server: string;               // URL base http(s), p. ej. "http://127.0.0.1:4010"; otra cosa → error
  store: string;                // carpeta que simula la flash (fuera del repo)
  panel: Panel;                 // panel declarado; por defecto { w: 800, h: 480, dpi: 124, depth: 1 }
  formats: ("raw1" | "png1")[]; // en v1: ["raw1"]
  power: "battery" | "usb";
  batteryMv?: number;
  rssi?: number;
  firmware: string;             // por defecto "emulator-0.1.0"
  extraViewsPerWake: number;    // con batería; por defecto 2
  flashBytes: number;           // por defecto 1_468_006 (≈ 1,4 MiB)
  timeoutMs: number;            // por petición; por defecto 10_000
  fallbackWakeS: number;        // si el índice falla; por defecto 300
}

export interface RequestRecord { method: "GET" | "POST"; path: string; status: number | "error"; bytes: number }
export type EmulatorErrorCode =
  | "index_invalid" | "panel_mismatch" | "crc_mismatch" | "bad_image" | "zones_invalid"
  | "stale_view" | "flash_full" | "network" | "too_large";
export interface WakeReport {
  requests: RequestRecord[];    // en el orden en que se hicieron
  downloaded: string[];         // vistas guardadas en esta despertada, en orden
  current: string | null;       // vista en pantalla al terminar
  nextWakeS: number;
  errors: { code: EmulatorErrorCode; view?: string }[];
  connections: number;          // conexiones TCP abiertas durante la despertada
}
export type Key = "tab" | "long-tab" | "ok" | "long-ok";
export interface PressReport {
  key: Key;
  current: string | null;
  focus: string | null;         // id de la zona con foco, o null
  requests: RequestRecord[];
  errors: { code: EmulatorErrorCode; view?: string }[];
}

export function defaultConfig(server: string, store: string): EmulatorConfig;
export function runWake(config: EmulatorConfig): Promise<WakeReport>;
export function press(config: EmulatorConfig, key: Key): Promise<PressReport>;
export function renderScreen(raw1: Uint8Array, panel: Panel, focus?: Zone): Uint8Array; // raw1 con el marco del foco
export function encodePng1(raw1: Uint8Array, panel: Panel): Uint8Array;
```
`path` en `RequestRecord` incluye la cadena de consulta (p. ej. `/api/v1/views/todo/image?h=9f2c1a7b`).

### Almacenamiento (la «flash»), dentro de `config.store`
| Archivo | Contenido |
|---------|-----------|
| `index.json` | Último índice válido |
| `views/<id>.raw1` | Imagen de la vista |
| `views/<id>.zones.json` | Zonas de la vista |
| `views/<id>.meta.json` | `{ "hash": "…", "crc32": "…", "bytes": N }` |
| `queue.json` | Acciones pendientes (máx. 8 por envío; se guardan todas) |
| `state.json` | `{ "current": "<id>" \| null, "focus": "<zone id>" \| null }` |
| `screen.raw1` / `screen.png` | Lo que muestra el panel ahora |

- Una vista solo cuenta como guardada si están sus **tres** archivos (`raw1`, `zones.json`, `meta.json`). Se escriben primero con otro nombre y se renombran (nunca queda una vista a medias).
- **Tope de flash:** la suma de `views/*` + `queue.json` nunca pasa `flashBytes`. Si una vista no cabe, se borran primero las vistas guardadas **más lejanas** de la actual en el orden del índice (nunca la actual); si aun así no cabe, no se guarda y se reporta `flash_full`.

### Una despertada (`runWake`)
1. `GET /api/v1/index` con las cabeceras obligatorias (`Tintero-Protocol: 1`, `Tintero-Firmware`, `Tintero-Power`, `Tintero-Formats`, `Tintero-Panel` con `formatPanelHeader`; `Tintero-Battery-mV` y `Tintero-RSSI` si están). **Todas** las peticiones llevan estas cabeceras.
2. El cuerpo se lee con **tope antes de parsear** (`maxIndexBytes`); si lo pasa → `too_large`. `validateIndex`; si falla → `index_invalid`. En ambos casos: no se descarga nada, la pantalla no cambia, `nextWakeS = fallbackWakeS`.
3. Si `index.panel` ≠ panel declarado → `panel_mismatch`: no se descarga nada, la pantalla no cambia, `nextWakeS = index.next_wake_s`.
4. Se **borran** de la flash las vistas que ya no están en el índice.
5. Si hay acciones en `queue.json`, se mandan **antes** de descargar (`POST /api/v1/actions`, de a 8). Las que respondan `applied`, `duplicate` o `stale` salen de la cola. Si alguna respuesta trae `index_changed: true`, se vuelve a pedir el índice **una vez**.
6. Vistas a descargar: las del índice cuya huella guardada sea distinta (o no estén). Orden: **primero `current`**, luego las demás en el orden del índice empezando después de `current` (circular). Con `battery`, como mucho **`current` + `extraViewsPerWake`**; con `usb`, todas.
7. Por cada vista, **una a la vez**: `GET …/image?h=<hash>` (cuerpo con tope: `bytes` del índice, y nunca más de `maxImageBytes`; si lo pasa → `too_large`) → `checkImage(format, bytes, panel, crc32)` (si falla → `crc_mismatch` o `bad_image`, no se guarda); luego `GET …/zones?h=<hash>` con tope `maxZonesBytes` → `validateZones` (si falla → `zones_invalid`). Un **409 `stale_view`** hace pedir el índice otra vez (**una sola vez por despertada**) y reiniciar el paso 6; un segundo 409 termina las descargas con `stale_view`.
8. **Pantalla:** si la vista `current` está guardada, `screen.raw1` = su imagen (con el foco si lo hay) y `screen.png` = `encodePng1(screen.raw1)`. Si no está, la pantalla no cambia.
9. Si hubo errores, `POST /api/v1/log` (una sola petición, ≤ 10 entradas, `level: "error"` o `"warn"`, `msg` ≤ 200 caracteres sin datos del contenido).
10. `nextWakeS = index.next_wake_s`. Un fallo de red en cualquier paso → `network`, se detiene la despertada sin borrar nada.

**Reglas de red (ESP32):** **una petición a la vez** y **una sola conexión** por despertada (`keep-alive` con un agente de un solo socket). Tiempo máximo por petición `timeoutMs`.

### Los toques (`press`)
| Toque | Qué hace | Red |
|-------|----------|-----|
| `tab` | El foco pasa a la zona siguiente de la vista actual (en el orden de sus zonas, circular). Sin zonas → no hace nada | No |
| `long-tab` | Pasa a la vista siguiente del índice (circular) y quita el foco. Si no está guardada, la descarga en ese momento (imagen + zonas) | Solo si falta |
| `ok` | Sobre una zona con foco: encola la acción (`id` aleatorio `^[a-z0-9]{12}$`, `act` de la zona, `at` en segundos Unix) y la manda de inmediato. Con `index_changed: true`, pide el índice y descarga la vista actual si cambió. Sin red → queda en `queue.json` (`network`) | Sí |
| `long-ok` | Si la vista actual tiene `parent` → vuelve a esa vista **sin red** (D1). Si no → «actualizar ya»: corre una despertada | Según el caso |

**El foco se dibuja invirtiendo un marco de 3 px** dentro del rectángulo de la zona (los píxeles a menos de 3 px de su borde, contando desde adentro). Cada toque reescribe `screen.raw1`, `screen.png` y `state.json`.

### Formato de pantalla
- `screen.raw1`: igual que `raw1` del contrato (MSB primero, **1 = negro**, filas rellenadas al byte).
- `screen.png`: PNG gris de 1 bit, sin entrelazado. **En PNG gris, 0 es negro**: los bits se **invierten** al codificar. Debe pasar `checkImage("png1", …, panel)`.

### CLI (`npm run emulator -- …`, en `emulator/src/cli.ts`)
```
--server <url>  --store <carpeta>  [--panel w=800,h=480,dpi=124,depth=1]  [--formats raw1]
[--power battery|usb]  [--battery-mv N]  [--rssi N]  [--firmware txt]  [--extra-views N]
[--flash-bytes N]  [--timeout-ms N]  [--wakes N (1)]  [--keys tab,long-tab,ok,long-ok]
```
Corre `--wakes` despertadas seguidas (sin dormir) y luego los `--keys` en orden; imprime **un JSON por línea** (cada `WakeReport` y cada `PressReport`). Salida 0 si terminó (aunque haya errores reportados); **2** con opciones inválidas (y el uso en stderr).

## Requisitos
- R1. Código en `emulator/src/`, pruebas unitarias junto al código; usa el contrato (`contract/src/index.ts`) para validar todo lo que recibe.
- R2. Cliente HTTP propio sobre `node:http`/`node:https` con un agente `keepAlive` de **un solo socket**; listo para recibir opciones TLS (F-004).
- R3. Codificador PNG propio (IHDR, IDAT con `node:zlib`, IEND, CRC de `node:zlib`).
- R4. `emulator/README.md`: primera línea descriptiva; cómo usar la CLI contra el simulador (`npm run contract:mock`) y qué hay en la carpeta de almacenamiento.
- R5. Cambio aditivo del contrato (D1) con sus ejemplos nuevos; `npm run contract:check` pasa.

## Criterios de aceptación
Las pruebas levantan su **propio servidor** de prueba en `127.0.0.1` (puerto efímero) que cumple el contrato, con tres vistas `raw1` de 800 × 480: `todo` (actual; zonas `t1` toggle `{24,72,752,40}`, `t2` toggle `{24,120,752,40}`, `ev1` open `{24,400,360,56}`), `agenda` (una zona open) y `jira` (sin zonas), cada una con un patrón de píxeles distinto conocido. Carpetas de almacenamiento temporales, borradas al terminar.

- **CA1.** Con `power: "battery"` y `extraViewsPerWake: 1`, la primera despertada hace **exactamente**: `GET index`, `GET todo/image`, `GET todo/zones`, `GET agenda/image`, `GET agenda/zones`; `downloaded = ["todo","agenda"]`; `current = "todo"`.
- **CA2.** La segunda despertada (sin cambios en el servidor) hace `GET index`, `GET jira/image`, `GET jira/zones`; la tercera solo `GET index`.
- **CA3.** Con `power: "usb"`, la primera despertada descarga las tres vistas.
- **CA4.** En cada despertada, el servidor ve **una sola conexión** (`connections = 1`) y **nunca dos peticiones a la vez**.
- **CA5.** Toda petición lleva las cabeceras obligatorias, y `validateDeviceHeaders` las acepta; `Tintero-Panel` es `w=800,h=480,dpi=124,depth=1` con el panel por defecto.
- **CA6.** Si el servidor manda la imagen de `agenda` con un byte cambiado (CRC no coincide): `agenda` no se guarda, `errors` tiene `crc_mismatch` con `view: "agenda"`, hay un `POST /api/v1/log` y la despertada siguiente la vuelve a pedir.
- **CA7.** Un 409 `stale_view` en una imagen provoca **un** `GET index` extra y la descarga sigue; si el 409 se repite, las descargas terminan con `stale_view`.
- **CA8.** Si el índice trae `panel` 648 × 480: solo `GET index` (+ `POST log`), `panel_mismatch`, `screen.raw1` no cambia.
- **CA9.** Un índice de 3000 bytes da `too_large` sin descargar nada; una imagen cuyo cuerpo pasa sus `bytes` declarados da `too_large` y no se guarda.
- **CA10.** Con el servidor apagado: `network`, `nextWakeS = 300`, la pantalla y la flash no cambian.
- **CA11.** Tras la primera despertada, `screen.raw1` es **byte a byte** la imagen de `todo`; `screen.png` pasa `checkImage("png1", …, panel)` y un píxel negro conocido de `todo` es negro en el PNG (0) y uno blanco es blanco (1).
- **CA12.** `tab` ×1 → foco `t1`; `screen.raw1` es la imagen de `todo` con el marco de 3 px invertido exactamente en `{24,72,752,40}`; `tab` ×3 → `ev1`; ×4 → `t1` (circular). Ninguno hace peticiones.
- **CA13.** `long-tab` con `agenda` guardada → `current = "agenda"`, foco `null`, sin peticiones; con `jira` sin guardar → solo `GET jira/image` y `GET jira/zones`.
- **CA14.** `ok` con foco en `t2` → `POST /api/v1/actions` con una acción `{ view: "todo", zone: "t2", act: "toggle" }`, `id` que cumple `^[a-z0-9]{12}$` y `at` entero; si la respuesta trae `index_changed: true` → `GET index` y, si la huella de `todo` cambió, su imagen y zonas.
- **CA15.** `ok` con el servidor apagado → la acción queda en `queue.json` y `errors` tiene `network`; la despertada siguiente manda esa acción (**mismo `id`**) **antes** de cualquier descarga; con respuesta `duplicate` también sale de la cola.
- **CA16.** `ok` sobre `ev1` (open) → el servidor cambia `current` a una vista `detalle` con `parent: "todo"`; el emulador la muestra. `long-ok` → vuelve a `todo` **sin peticiones**. `long-ok` sobre `todo` (sin `parent`) → una despertada (`GET index` primero).
- **CA17.** Con `flashBytes: 100000` y las tres vistas (≈ 48 KB cada una): la flash nunca pasa 100 000 bytes; quedan `todo` y `agenda`; `jira` da `flash_full`.
- **CA18.** Si `jira` desaparece del índice, sus tres archivos se borran en la despertada siguiente.
- **CA19.** Contrato (D1): `validateIndex` acepta una vista con `parent` existente; rechaza `parent` inexistente y `parent` igual a su propio `id` con `unknown_parent`; los tres ejemplos nuevos existen y validan como dice su nombre; `npm run contract:check` pasa; ningún ejemplo existente cambió.
- **CA20.** CLI: `--wakes 2 --power usb` imprime 2 líneas JSON con forma de `WakeReport` y sale con 0; `--keys tab,tab` imprime además 2 `PressReport`; una opción desconocida sale con 2.
- **CA21.** Con `npm run contract:mock` corriendo, una despertada de la CLI contra `http://127.0.0.1:4010` termina con salida 0 y el `GET index` responde 200 con un índice válido (los errores de imagen del simulador se reportan, no rompen nada).

## Presupuestos
- Una despertada con tres vistas contra el servidor de prueba local: **< 2 s**.
- Lecturas de red con tope **antes** de parsear: índice ≤ `maxIndexBytes`, zonas ≤ `maxZonesBytes`, imágenes ≤ `bytes` declarados (y ≤ `maxImageBytes`), respuestas de acciones y registro ≤ 4096 bytes.

## Seguridad
- [x] Toda entrada externa con **límite de tamaño antes de parsear** (arriba).
- [x] Servicios locales solo en **127.0.0.1**; en las pruebas, HTTP a 127.0.0.1 solo con la función auxiliar de `docs/seguridad.md`.
- [x] Dependencias nuevas: ninguna.
- `--server` solo acepta `http:` o `https:`. El registro (`POST /api/v1/log`) no lleva contenido de vistas ni de zonas (S6).
- La carpeta de almacenamiento va **fuera del repo** (por defecto en la carpeta temporal del sistema); las pruebas usan carpetas temporales y las borran.

## Archivos
- A crear: `emulator/src/*.ts` (índice, configuración, cliente HTTP, almacenamiento, despertada, toques, pantalla, PNG, CLI) y sus `*.test.ts`; `emulator/README.md` (reemplaza el actual); los 3 ejemplos nuevos del contrato.
- A tocar: `contract/src/` (campo `parent`, código `unknown_parent`), `contract/schema/v1/index.schema.json` y `contract/openapi/v1.json` (regenerados), `package.json` (script `emulator`), `knip.json` (entrada de la CLI).

## Resultado esperado
`npm run emulator -- --server http://127.0.0.1:4010 --store /tmp/emu --wakes 1` despierta como lo haría el ESP32 y deja en `/tmp/emu/screen.png` lo que mostraría el panel. El servidor de F-003 se podrá probar de punta a punta con `runWake` y `press`.

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
