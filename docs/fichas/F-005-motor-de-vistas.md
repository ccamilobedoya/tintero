# F-005 · Motor de vistas

**Estado:** borrador: espera la puerta 1 (D1–D7)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** **`playwright-core`** 1.64.1 (D1): maneja el Chromium sin interfaz por CDP. Licencia Apache-2.0, **sin dependencias propias** y sin scripts de instalación (no baja navegadores). Chromium **no** es un paquete npm: corre en Docker, con la imagen fijada por *digest* en `tools/images.conf` (`CHROMIUM_IMAGE`). Las fuentes tipográficas van como archivos en el repo (D5).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** | **¿Cómo se dibuja?** | **HTML/CSS en un Chromium sin interfaz**, en un contenedor Docker endurecido que solo escucha en `127.0.0.1`, manejado con `playwright-core` por CDP. El texto se dibuja **sin suavizado** (fontconfig: `antialias=false`, *hinting* completo), así que la captura ya sale en blanco y negro puros y el paso a 1 bit es un umbral. Todo queda detrás de una interfaz `Renderer`, para cambiar de motor después sin tocar lo demás | **Medido** (ver *Lo verificado*): texto nítido, **0 píxeles grises**, 100–200 ms por vista con el navegador ya abierto, y las zonas salen de la posición de los elementos en la página. Los diseños son HTML/CSS: se prueban en un navegador y cualquiera puede aportar uno (versión pública). Es la propuesta del documento 4 |
| | Alternativas | **(b) Satori + resvg** (sin navegador): unos 10–15 paquetes (resvg trae un binario nativo o WASM); solo un subconjunto de CSS (flexbox); el texto sale suavizado y hay que umbralizarlo; la posición de los elementos no se expone, así que las zonas habría que calcularlas aparte. **(c) Dibujo propio con fuentes de mapa de bits** (como `server/src/draw.ts`): 0 dependencias, lo más rápido y nítido; pero las fuentes vienen en tamaños fijos (las unidades físicas se aproximan), casi siempre son monoespaciadas, y cada diseño se programa en TypeScript | (b) ahorra el navegador pero da peor texto a 1 bit y más paquetes; (c) es lo más liviano, pero choca con «diseños escalables» y con aportar diseños |
| **D2** | **¿Cómo se arma una vista?** | El modelo de **cuatro capas** del documento 4: **perfil de panel** (lo declara el aparato), **distribución** (cómo se parte la pantalla), **bloque** (dibuja un *tipo de dato*, sin saber de qué integración viene) y **tema** (letras, grosores, márgenes). **Todo en unidades físicas** (mm y puntos) y convertido con los ppp del panel. Una vista es un objeto JSON: título, distribución y un bloque con su fuente en cada espacio. **En F-005:** tema `base`, distribuciones `full` y `columns-2`, bloques `task-list`, `agenda` y el detalle de un evento | Requisito «diseños escalables» (F14): N fuentes + M bloques, no N × M. Los diseños que defina el dueño llegan después como bloques, temas y atributos nuevos **sin cambiar el motor**. Las unidades físicas salen de D5 de F-001 |
| **D3** | **¿Dónde se configura qué vistas tiene cada pantalla**, si todavía no hay web ni base de datos? | En **un archivo JSON** fuera del repo (`--views <archivo>`), con un ejemplo en el repo (`config/views.example.json`). Se lee al arrancar: para cambiarlo, se reinicia. Pantallas sin entrada propia usan la de `"*"` | Lo mínimo que permite varias pantallas con vistas distintas (F5). La web (F2) y la base de datos llegan en su propia ficha y reemplazan el archivo |
| **D4** | **¿De dónde salen los datos** antes de la primera integración? | De un **archivo de datos sintéticos** (M4, `--data <archivo>`; ejemplo en `config/data.example.json`) con los dos primeros **tipos de datos comunes**: `tasks` y `events`, cada uno con los campos mínimos y algunos opcionales (ver *Contrato*). Marcar una tarea desde la pantalla la cambia **en memoria**. F-006 reemplaza esta fuente por el tablero de Trilium | Permite probar todo el motor sin llaves ni red (M4). Los atributos finales del tablero se deciden con los diseños (ADR-0010); los tipos crecen con campos opcionales |
| **D5** | **¿Qué letra?** | **Liberation Sans** (normal y negrita), licencia **SIL OFL 1.1**: los `.ttf` y la licencia van en el repo (`server/fonts/`). Tamaño mínimo de texto: **8 pt** (≈ 14 px a 124 ppp) | Tiene buenas instrucciones de *hinting*, que es lo que la hace nítida sin suavizado (medido). Sin descargas en tiempo de ejecución. Alternativas: DejaVu Sans; Atkinson Hyperlegible (pensada para baja visión; hay que probar cómo se ve sin suavizado). El tamaño de letra cómodo se confirma en la placa real (M9) |
| **D6** | **¿Cuándo se dibuja?** | **Cuando cambian los datos**, en segundo plano, con una cola y un solo Chromium: después de una acción se redibujan enseguida las vistas afectadas, para cada pantalla y panel conocidos. La primera vez que aparece un panel, o cuando cambia el día, dibuja el índice. **El índice espera los dibujos pendientes como mucho 2 s**; si no alcanzan, responde `503 busy` con `Retry-After: 5`. Una vista que comparten varias pantallas con el mismo panel se dibuja **una sola vez** | Así el aparato casi nunca espera a Chromium con el WiFi encendido (documento 4, *C progresiva*), y cuando pide el índice después de marcar, la vista nueva ya está lista |
| **D7** | **¿Qué vista muestra el aparato al despertar?** *(hallazgo)* | El emulador (F-002) muestra en cada despertada el `current` del índice, y el servidor no sabe a qué vista se movió el aparato con Mover largo. **En F-005:** `current` es la primera vista del aparato; justo después de abrir un detalle, el detalle (**solo en el siguiente índice**) y después la vista de la que salió. **Propuesta aparte:** una ficha pequeña (F-008) para que el aparato informe su vista actual con una cabecera opcional (`Tintero-View`, compatible con v1) | Sin eso, cada despertada devuelve la pantalla a la primera vista. No se arregla aquí porque toca el contrato y el emulador |

## Lo verificado por el arquitecto (2026-10-23)
- [x] **Chromium en Docker, sin suavizado:** la imagen `chromedp/headless-shell` (Chrome 156, 157 MB, Debian 13) con `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, puerto CDP solo en `127.0.0.1`, las fuentes montadas de solo lectura y un `fonts.conf` con `antialias=false` + `hintstyle=hintfull`. Con `--font-render-hinting=full --disable-font-subpixel-positioning --disable-lcd-text`, una vista de prueba de 800 × 480 (lista por categorías + agenda, Liberation Sans de 11 a 20 px, tildes y eñes) dio **0 píxeles grises** en la captura. Con suavizado, la misma vista dio 15 728 grises.
- [x] **`playwright-core` por CDP** (`chromium.connectOverCDP`), contexto con `javaScriptEnabled: false`, todas las peticiones bloqueadas (`page.route` → `abort`) y CSP `default-src 'none'`: `setContent` + leer las cajas de los elementos marcados + captura, **100–200 ms** por vista con el navegador abierto (40–90 ms con Chromium local). Las cajas leídas coinciden con el CSS (p. ej. una fila en `x 15, y 75, w 443, h 33`).
- [x] Arrancar el contenedor y quedar listo para CDP: ~2 s con la imagen ya descargada.
- [x] `playwright-core` 1.64.1 (2026-10-14): Apache-2.0, sin dependencias en `package.json`, 13,7 MB.

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] Nombres de archivos, rutas, puertos y URLs escritos: ejemplos `config/views.example.json` y `config/data.example.json` (los escribe el arquitecto con esta ficha; **nadie más los modifica**), contenedores `tintero-chromium-<sufijo>`, puerto CDP efímero en `127.0.0.1`, zona horaria de las pruebas `UTC` (y `America/Lima` en CA11).
- [x] Toda función que se prueba tiene nombre y firma; `renders()` cuenta **desde que se crea el motor** (`createEngine`).

## Contexto
F-003 sirve vistas de demostración dibujadas a mano. Esta ficha arma el **motor de vistas** del documento 4: distribuciones, bloques, perfil de panel, paso a 1 bit y mapa de zonas, con datos sintéticos (M4), para que la primera integración (F-006, tareas de Trilium) solo tenga que entregar datos. Aplican ADR-0001 (el servidor dibuja), ADR-0006 (navegación B con C progresiva), ADR-0009 (modelo de integraciones: los bloques no conocen la integración), ADR-0010 (los atributos de las tareas se deciden con los diseños) y D5 de F-001 (unidades físicas).

## Alcance
- Conversión de unidades físicas a píxeles con los ppp del panel.
- Archivo de vistas (D3) y archivo de datos sintéticos (D4): esquemas, límites y carga.
- Tema `base`; distribuciones `full` y `columns-2` (en un panel vertical, los espacios se apilan); bloques `task-list`, `agenda` y `event-detail`.
- Dibujo con Chromium en Docker (D1): arranque del contenedor, conexión, captura, paso a 1 bit, cajas de las zonas.
- Motor: huellas, caché compartida, cola de dibujo (D6), estado por aparato (vista actual y detalle abierto), acciones `toggle` y `open`.
- Servidor: si se le dan `--views` y `--data`, sirve las vistas del motor; si no, la demostración de F-003, igual que hoy.
- Vista previa por línea de comandos (`npm run render`): la misma imagen que recibe el aparato, más una copia con las zonas marcadas (F4).

**Fuera de alcance:** integraciones reales y el núcleo de integraciones (F-006 en adelante); web de configuración y base de datos; usuarios (cada pantalla tiene sus vistas; los usuarios llegan con la web); el planificador (`next_wake_s` sigue saliendo de `--next-wake-s`); tramado de fotos y degradados (ningún bloque lleva imágenes todavía); `png1`; grises (`depth` 2); paginar listas con `Tab`; que el aparato informe su vista (D7, F-008); empaque en Docker Compose del servidor.

## Requisitos
- R1. Código en `server/src/engine/`, con pruebas unitarias. Las pruebas unitarias **no** necesitan Docker: usan un `Renderer` falso. Las que usan el Chromium real van en las pruebas de aceptación (y el programador puede probar a mano con `npm run render`).
- R2. Todo lo que entra (archivo de vistas, archivo de datos, PNG de Chromium) se limita en tamaño **antes** de parsearlo; los archivos se leen con la lectura con tope (regla `tintero-lectura-sin-tope`).
- R3. `server/README.md`: cómo arrancar con vistas y datos, cómo ver la vista previa, y cómo se escribe un bloque nuevo (para los diseños que vienen).
- R4. Lo que no cambie esta ficha sigue igual: las pruebas de aceptación de F-001 a F-004 pasan.

## Contrato

### Unidades (`server/src/engine/units.ts`)
```ts
export function mmToPx(mm: number, dpi: number): number; // max(1, round(mm × dpi / 25,4))
export function ptToPx(pt: number, dpi: number): number; // max(1, round(pt × dpi / 72))
```

### Tema `base` (todo en unidades físicas)
| Elemento | Valor | A 124 ppp | A 200 ppp |
|----------|-------|-----------|-----------|
| Margen interior de cada espacio | 3 mm | 15 px | 24 px |
| Barra de título: alto | 9 mm | 44 px | 71 px |
| Línea bajo la barra y divisor entre espacios | 0,5 mm | 2 px | 4 px |
| Encabezado (categoría o día): alto de fila | 6 mm | 29 px | 47 px |
| Fila de tarea o evento: alto | 8 mm | 39 px | 63 px |
| Fila «+N más»: alto | 6 mm | 29 px | 47 px |
| Casilla: lado / borde | 4 mm / 0,5 mm | 20 / 2 px | 31 / 4 px |
| Columna de la hora (agenda): ancho | 18 mm | 88 px | 142 px |
| Letra del texto / título de la barra | 12 pt / 12 pt negrita | 21 px | 33 px |
| Letra del encabezado (mayúsculas, negrita) / «+N más» / fecha de la barra | 9 pt / 9 pt / 10 pt | 16 / 16 / 17 px | |
| Letra mínima permitida | 8 pt | 14 px | 22 px |

Fuente: Liberation Sans (D5), sin suavizado. Todas las medidas se convierten con `mmToPx` / `ptToPx` y se posicionan en **píxeles enteros** (sin fracciones), así las zonas que se leen de la página son exactas.

### Archivo de vistas (`--views`, ≤ 64 KiB; ejemplo `config/views.example.json`)
```json
{
  "version": 1, "timezone": "UTC", "theme": "base",
  "devices": { "*": { "views": ["pendientes", "agenda", "resumen"] } },
  "views": [
    { "id": "resumen", "title": "Resumen", "layout": "columns-2", "split": 60,
      "slots": [ { "block": "task-list", "source": "tareas" }, { "block": "agenda", "source": "calendario" } ] }
  ]
}
```
- `version`: 1. `timezone`: zona IANA que acepte `Intl.DateTimeFormat`. `theme`: `"base"`.
- `devices`: claves = id de aparato (`^[a-z0-9-]{1,32}$`, el de la lista de aparatos de F-004; sin TLS el aparato es `local`) o `"*"`; **`"*"` es obligatorio**. `views`: 1–15 ids que existan (deja lugar para un detalle: el índice admite 16).
- `views`: 1–32. `id`: `^[a-z0-9_]{1,14}$`, sin repetir (sin `-`: los detalles se llaman `<id>-d`). `title`: 1–40 caracteres. `layout`: `full` (exactamente 1 espacio) o `columns-2` (exactamente 2). `split`: 30–70, por defecto 50 (porcentaje del primer espacio; solo en `columns-2`).
- `slots[]`: `block` (`task-list` \| `agenda`), `source` (id de una fuente del archivo de datos, del tipo que pide el bloque: `task-list` → `tasks`, `agenda` → `events`), `options` opcional: `task-list` → `{ "group_by": "category" | "none" }` (por defecto `category`); `agenda` → `{ "days": 1–14 }` (por defecto 7: hoy y los 6 días siguientes).
- **Campos desconocidos → error** (es un archivo del dueño: así se atrapan errores de tipeo).

### Archivo de datos sintéticos (`--data`, ≤ 512 KiB; ejemplo `config/data.example.json`)
- `{ "version": 1, "sources": { "<id>": { "type": "tasks" | "events", "items": [...] } } }`; ids de fuente `^[a-z0-9_]{1,32}$`, 1–16 fuentes, **0–500 elementos** por fuente, ids de elemento `^[A-Za-z0-9_-]{1,64}$` sin repetir dentro de la fuente. Campos desconocidos → error.
- **`Task`** (`tasks`): `id`, `title` (1–200), `done` (booleano), `category?` (1–40), `due?` (`AAAA-MM-DD`).
- **`CalendarEvent`** (`events`): `id`, `title` (1–200), `start` (fecha y hora RFC 3339 con zona, o `AAAA-MM-DD` = todo el día), `end?` (del mismo tipo que `start` y no antes), `location?` (1–100), `notes?` (1–1000).

### Carga (`server/src/engine/config.ts`)
```ts
export class ConfigError extends Error {}  // mensaje: "<archivo>: <ruta JSON Pointer>: <motivo>" o "<archivo>: too large"
export function parseViewsConfig(raw: string): ViewsConfig;               // lanza ConfigError
export function parseDataFile(raw: string, config: ViewsConfig): DataFile; // lanza ConfigError (también si una vista usa una fuente que falta o de otro tipo)
export function loadViewsConfig(path: string): ViewsConfig;               // lectura con tope de 65 536 bytes
export function loadDataFile(path: string, config: ViewsConfig): DataFile; // lectura con tope de 524 288 bytes
```
El texto de `ConfigError` nunca incluye valores del archivo (títulos, notas): solo la ruta y el motivo.

### Distribuciones (con `B` = alto de la barra, `L` = grosor de la línea)
- El **cuerpo** va de `y = B + L` hasta el borde inferior; la línea bajo la barra ocupa `y = B … B + L − 1`.
- **`full`**: un espacio = el cuerpo entero.
- **`columns-2`**, panel apaisado o cuadrado (`w ≥ h`): primer espacio `x = 0 … P − 1` con `P = round(w × split / 100)`; divisor negro `x = P … P + L − 1`; segundo espacio desde `x = P + L` hasta el borde.
- **`columns-2`**, panel vertical (`h > w`): igual, pero apilado: primer espacio de alto `Q = round(altoCuerpo × split / 100)` desde `y = B + L`; divisor de alto `L`; segundo espacio debajo.
- El contenido de cada espacio empieza a un margen `M` de sus bordes.

### Bloques
**Regla común:** las filas tienen el alto fijo del tema y van **una debajo de otra, en orden**. Un encabezado solo se pone si cabe junto con al menos una fila suya. **Si no cabe todo**, se reserva al final una fila «+N más» (N = elementos que no se muestran) y se colocan filas mientras quepan en el resto; **en cuanto una no cabe, se detiene** (no se salta a otra más corta). La fila «+N más» no recibe el foco. Un texto que no cabe en su línea termina en «…». El texto viene de los datos y **siempre** se escapa (ver *Seguridad*).

- **`task-list`** (tipo `tasks`): con `group_by: "category"`, las categorías van en el orden en que aparecen por primera vez en los datos, y las tareas sin categoría al final, bajo «Sin categoría»; con `"none"`, sin encabezados. Cada fila: casilla (en `x = margen izquierdo`, `y = arriba de la fila + floor((alto de fila − lado) / 2)`), el título y, si hay `due`, la fecha corta a la derecha (`25 oct`). Hecha = casilla **rellena de negro** y título tachado; pendiente = solo el borde. Cada fila es una zona **`toggle`**.
- **`agenda`** (tipo `events`): eventos cuyo día local (en `timezone`) va de hoy a hoy + `days` − 1; los de días anteriores no salen, y los de hoy salen todos aunque ya hayan pasado. Agrupados por día con encabezado `JUE 23 OCT`; dentro del día, primero los de todo el día y luego por hora de inicio (empate: orden de los datos). Cada fila: la hora `HH:MM` en la columna de la hora (o «Todo el día», en 9 pt) y el título. Cada fila es una zona **`open`**.
- **`event-detail`** (lo usa el motor, no el archivo de vistas): vista `<id>-d` con `parent: "<id>"`, distribución `full`, sin zonas. Barra: «Detalle». Cuerpo: título (negrita, hasta 3 líneas), día y horas (`jue 23 oct · 14:00–14:30`, o `· todo el día`), lugar si hay, y las notas, cortadas con «…» si no caben.
- **Barra de título** (toda vista): a la izquierda el `title` de la vista; a la derecha la fecha local de hoy (`jue 23 oct`). Días: `dom lun mar mié jue vie sáb`; meses: `ene feb mar abr may jun jul ago sep oct nov dic`; horas en 24 h. **Sin** textos relativos al tiempo («hace 5 min»).

### Zonas
- Cada elemento con foco lleva un marcador en el HTML; el `Renderer` devuelve su caja (`x, y, w, h` enteros) y el motor arma las zonas con ella.
- **Id de zona** (opaco, estable aunque cambie la lista): `zoneId(viewId, sourceId, itemId)` = `"z"` + los primeros **10** dígitos hexadecimales del SHA-256 de `` `${viewId}\n${sourceId}\n${itemId}` ``. Nunca sale al aparato el id ni el texto del elemento (S1).
- **Orden de `Tab`:** primero todas las zonas del primer espacio, después las del segundo; dentro de cada espacio, el orden de las filas.
- Cada zona queda dentro del panel y mide al menos 8 px; como mucho **48** por vista (las demás filas se dibujan pero no reciben el foco).

### Dibujo (`server/src/engine/chromium.ts`, `png.ts`)
```ts
export interface Box { key: string; x: number; y: number; w: number; h: number }
export interface RenderOutput { raw1: Uint8Array; gray: number; boxes: Box[] }
// gray: píxeles de la captura que no eran ni negro ni blanco puros, contados antes del umbral.
export interface Renderer {
  render(html: string, panel: Panel): Promise<RenderOutput>;
  blockedRequests(): number;   // peticiones que intentó hacer la página y se bloquearon, desde que se creó
  close(): Promise<void>;
}
export function chromiumDockerArgs(name: string, port: number, fontsDir: string, image: string): string[];
export function startChromium(options?: { port?: number }): Promise<{ endpoint: string; name: string; stop(): Promise<void> }>;
export function chromiumRenderer(endpoint: string, options?: { timeoutMs?: number }): Promise<Renderer>;
export function decodePng(bytes: Uint8Array, panel: Panel): Uint8Array;   // luminancia 8 bits por píxel, w × h
export function toRaw1(gray: Uint8Array, panel: Panel): Uint8Array;       // < 128 → negro (1); formato raw1 de F-001
```
- **Contenedor:** `chromiumDockerArgs` arma `run --rm -d --name <name> -p 127.0.0.1:<port>:9222 --read-only --tmpfs /tmp:size=64m --cap-drop ALL --security-opt no-new-privileges --memory 512m --pids-limit 256 --mount type=bind,source=<fontsDir>,target=/tintero/fonts,readonly -e FONTCONFIG_FILE=/tintero/fonts/fonts.conf <image> --font-render-hinting=full --disable-font-subpixel-positioning --disable-lcd-text`. Sin `-v`, sin `--privileged`, sin `--network host`, sin `0.0.0.0`.
- `startChromium`: nombre `tintero-chromium-<8 hex al azar>`; `port` 0 (por defecto) = puerto libre (lo lee de `docker port`); imagen `CHROMIUM_IMAGE` de `tools/images.conf`; fuentes de `server/fonts/`. Llama a `docker` **sin shell** (`execFile`). Espera hasta **30 s** a que `GET http://127.0.0.1:<port>/json/version` responda; si no, detiene el contenedor y falla. `endpoint` = `http://127.0.0.1:<port>`. `stop()` detiene el contenedor (con `--rm`, desaparece).
- `chromiumRenderer`: `connectOverCDP(endpoint)`; cada `render` usa un contexto nuevo con `viewport = { width: panel.w, height: panel.h }`, `deviceScaleFactor: 1`, `javaScriptEnabled: false`; **bloquea toda petición** (`route` → `abort`, contándola); `setContent(html)`; lee las cajas de los elementos con `data-zone`; captura PNG; cierra el contexto. Tiempo máximo por dibujo: `timeoutMs` (10 000). Si la conexión se cayó, el siguiente `render` reconecta una vez.
- `decodePng`: solo lo que entrega Chromium: PNG de 8 bits, RGB o RGBA, sin entrelazar, con los filtros 0–4. Comprueba que mide `panel.w × panel.h` **antes** de descomprimir, y descomprime con `maxOutputLength = h × (1 + w × 4)`. Luminancia = `round(0,299 R + 0,587 G + 0,114 B)`. Cualquier otra cosa → error.

### Motor (`server/src/engine/engine.ts`; todo se exporta en `server/src/engine/index.ts`)
```ts
export interface EngineOptions {
  config: ViewsConfig; data: DataFile; renderer: Renderer;
  clock?: () => Date;      // por defecto, la hora del sistema
  renderWaitMs?: number;   // por defecto 2000
}
export interface RenderedView {
  id: string; parent?: string; raw1: Uint8Array; zones: Zone[];
  hash: string; crc32: string;
  hidden: number[];        // por espacio: cuántos elementos no se mostraron
}
export type EngineError =
  | { status: 404; code: "unknown_view" }
  | { status: 409; code: "stale_view" }
  | { status: 503; code: "busy"; retryAfterS: 5 };
export type EngineResult<T> = { ok: true; value: T } | ({ ok: false } & EngineError);
export interface Engine {
  index(device: string, panel: Panel): Promise<EngineResult<{ current: string; views: RenderedView[] }>>;
  view(device: string, panel: Panel, id: string, hash: string): EngineResult<RenderedView>;
  apply(device: string, action: Action): { status: "applied" | "duplicate" | "stale"; changed: boolean };
  idle(): Promise<void>;   // se resuelve cuando la cola de dibujo está vacía
  renders(): number;       // llamadas a renderer.render desde createEngine
  close(): Promise<void>;
}
export function createEngine(options: EngineOptions): Engine;
export function zoneId(viewId: string, sourceId: string, itemId: string): string;
```
- **Vistas de un aparato:** las de su entrada en `devices` (o las de `"*"`), en ese orden, más `<id>-d` (con `parent`) si el aparato abrió un detalle desde la vista `<id>`; el detalle sigue en la lista hasta que abra otro.
- **`current`:** la primera vista del aparato; en el **primer** `index` después de un `open` aplicado, el detalle; desde el siguiente, la vista de la que salió el detalle (D7).
- **Huella:** como en F-003, los primeros 16 dígitos hexadecimales del SHA-256 de la imagen más el JSON de sus zonas.
- **Caché y clave de dibujo:** una vista se redibuja solo si cambia su clave: la definición de la vista, los datos de **sus** fuentes, el detalle abierto (solo para `<id>-d`), la fecha local de hoy y el panel. Misma clave → misma imagen, sin dibujar, aunque la pidan varios aparatos. Caché con expulsión de la menos usada, **256** entradas.
- **Cola (D6):** un dibujo a la vez. Después de un `apply` que cambia algo, se encolan las vistas afectadas para **cada aparato y panel ya vistos** por el motor. `index` encola lo que le falte (panel nuevo, día nuevo) y **espera** los dibujos pendientes de las vistas de ese aparato hasta `renderWaitMs`; si no terminan → `busy` (los dibujos siguen en la cola). Un dibujo que falla no borra la imagen anterior; si nunca hubo una, esa vista da `busy`.
- **`view`:** vista que no es del aparato → `unknown_view` (aunque exista para otro aparato); vista sin dibujo para ese panel o con huella distinta de `hash` → `stale_view`.
- **`apply`:** idempotente por `id` (recuerda los últimos 1000): la segunda vez, `duplicate` sin aplicar. `toggle` sobre una zona de `task-list` de una vista del aparato → invierte `done` de esa tarea **en memoria** (cambia para todas las vistas y aparatos que usan esa fuente). `open` sobre una zona de `agenda` → abre el detalle de ese evento para ese aparato. Cualquier otra combinación (vista ajena, zona desconocida, acción que no corresponde al bloque) → `stale`. Las zonas se resuelven con `zoneId` sobre **todos** los elementos de las fuentes de la vista (no solo los que se ven), así una acción guardada sin red sigue apuntando a la misma tarea aunque la lista haya cambiado.

### Servidor
- `npm run server -- … --views <archivo> --data <archivo> [--chromium <url>]`. `--views` y `--data` van juntos (si falta uno → sale con **2**). Un `ConfigError` → sale con **2** y su mensaje. Sin `--chromium`, el servidor arranca su propio contenedor con `startChromium()` y lo detiene al salir (Ctrl+C / SIGTERM). Con `--chromium`, solo acepta `http://127.0.0.1:<puerto>`.
- `ServerConfig` gana `engine?: Engine`. Con motor, las rutas usan el motor (el aparato es el id de la lista de aparatos con TLS, o `local` sin TLS); `503 busy` lleva `Retry-After: 5` y `ErrorBody`; `createApp(...).renders()` devuelve `engine.renders()`. Sin motor, todo sigue como en F-003/F-004.
- Registro (S6): una línea por dibujo `{ "ts", "render", "ms", "ok" }` (`render` = id de la vista), sin contenido.

### Vista previa (`server/scripts/render.ts`, `npm run render -- …`)
```
--views <archivo> --data <archivo> --panel w=800,h=480,dpi=124,depth=1 --out <carpeta>
[--device <id> (por defecto "*")] [--now <fecha RFC 3339>] [--chromium <url>]
```
Escribe, por cada vista del aparato: `<id>.png` (PNG de 1 bit, la misma imagen que recibe el aparato; puede reutilizar `encodePng1` del emulador), `<id>.zones.png` (igual, con el borde de cada zona invertido, 2 px) y `<id>.zones.json` (un `ZonesResponse`). Crea `--out` si no existe. Sale con 0, o con 2 ante opciones o archivos inválidos.

## Criterios de aceptación
Las pruebas que usan Chromium lo arrancan con `startChromium()` y lo detienen al terminar (también si fallan); las demás usan un `Renderer` falso. Reloj fijo `2026-10-23T12:00:00Z` y zona `UTC` salvo que se diga otra cosa. Paneles: `P124` = `w=800,h=480,dpi=124,depth=1`; `P200` = `w=800,h=480,dpi=200,depth=1`; `V124` = `w=480,h=800,dpi=124,depth=1`. «Los ejemplos» = `config/views.example.json` + `config/data.example.json`. Carpetas temporales fuera del repo, borradas al terminar. HTTP a 127.0.0.1 solo con la función auxiliar de `docs/seguridad.md`.

- **CA1 (unidades).** `mmToPx(3, 124) = 15`, `mmToPx(9, 124) = 44`, `mmToPx(0.5, 124) = 2`, `mmToPx(0.1, 124) = 1`, `ptToPx(12, 124) = 21`, `mmToPx(8, 200) = 63`, `ptToPx(12, 200) = 33`.
- **CA2 (carga).** Los ejemplos cargan sin error. `parseViewsConfig` lanza `ConfigError` cuya ruta es `/views/0/id` para un id `"pen-dientes"`; también lanza (con su ruta) por: un bloque `"clock"`, `devices` sin `"*"`, un aparato con una vista que no existe, `split: 80`, un campo desconocido `"colour"`, `columns-2` con un solo espacio. `parseDataFile` lanza por: una vista que usa una fuente que falta, `task-list` sobre una fuente `events`, un título de 201 caracteres, 501 tareas, ids repetidos, `end` antes de `start`. Un archivo de vistas de 70 000 bytes → `ConfigError` con `too large` **sin parsearlo**. Ningún mensaje contiene el título de una tarea del archivo.
- **CA3 (servidor con archivos inválidos).** `npm run server -- --port 0 --views <válido>` (sin `--data`) sale con 2; con un archivo de vistas inválido sale con 2 y el mensaje nombra la ruta JSON del error; `--chromium http://192.0.2.1:9222` sale con 2.
- **CA4 (contenedor).** `chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc")` contiene `-p`, `127.0.0.1:0:9222`, `--read-only`, `--cap-drop`, `ALL`, `--security-opt`, `no-new-privileges`, `--memory`, `512m`, `--pids-limit`, `256`, `--mount`, `type=bind,source=/f,target=/tintero/fonts,readonly` y `img@sha256:abc`; **no** contiene `-v`, `--privileged`, `--network`, `host` ni `0.0.0.0`.
- **CA5 (Chromium real).** `startChromium()` devuelve un `endpoint` `http://127.0.0.1:<puerto>`; con `chromiumRenderer`, dibujar la vista `pendientes` de los ejemplos en `P124` da `raw1` de **48 000** bytes y **`gray = 0`**; dibujarla otra vez da los mismos bytes. Después de `stop()`, `docker ps` ya no lista ese nombre.
- **CA6 (zonas, `full`, 124 ppp).** Con los ejemplos, la vista `pendientes` en `P124` tiene **7** zonas `toggle` y `hidden = [2]`; la primera es `{ x: 15, y: 90, w: 770, h: 39 }`, la segunda tiene `y: 129`; los ids son `zoneId("pendientes", "tareas", "t-001")` y `zoneId("pendientes", "tareas", "t-002")`; el cuerpo de zonas pasa `validateZones` con ese panel y **no** contiene `t-001` ni ningún título.
- **CA7 (otros ppp).** La misma vista en `P200` tiene su primera zona en `{ x: 24, y: 146, w: 752, h: 63 }` y `raw1` de 48 000 bytes.
- **CA8 (casillas).** En la imagen de `pendientes` (`P124`): la primera tarea (`t-001`, pendiente) tiene su casilla en `x = 15, y = 99` de 20 × 20: píxel negro en `(15, 109)` y `(16, 109)`, blanco en `(25, 109)` (centro); la segunda (`t-002`, hecha) tiene negro en el centro `(25, 148)`.
- **CA9 (`columns-2`).** La vista `resumen` en `P124`: 11 zonas, las 7 primeras `toggle` (espacio izquierdo, la primera `{ x: 15, y: 90, w: 450, h: 39 }`) y las 4 siguientes `open` (la primera `{ x: 497, y: 90, w: 288, h: 39 }`); `hidden = [2, 0]`; divisor negro en `(480, 300)` y `(481, 300)`, blanco en `(479, 300)` y `(482, 300)`.
- **CA10 (panel vertical).** La vista `resumen` en `V124`: `raw1` de 48 000 bytes; primera zona del espacio de arriba `{ x: 15, y: 90, w: 450, h: 39 }`; primera zona del de abajo `{ x: 15, y: 544, w: 450, h: 39 }`.
- **CA11 (agenda).** Con los ejemplos, `agenda` en `P124`: 4 zonas `open` en `y = 90, 129, 168, 236` (en ese orden: `e-002`, `e-003`, `e-004`, `e-005`); `e-001` y `e-006` no tienen zona. Con `timezone: "America/Lima"` y reloj `2026-10-24T03:00:00Z` (22:00 del 23 en Lima), un evento `2026-10-24T02:00:00Z` (21:00 del 23 en Lima) sale bajo el día 23.
- **CA12 (abrir un detalle).** `apply` de `open` sobre la zona de `e-003` en `agenda` (aparato `local`) → `applied`, `changed: true`. El siguiente `index` trae `agenda-d` con `parent: "agenda"` y `current = "agenda-d"`; sus zonas son `[]`; el `index` que sigue trae `current = "agenda"` y `agenda-d` sigue en la lista.
- **CA13 (marcar).** Con el motor ya dibujado para `local` en `P124`: `apply` de `toggle` sobre la zona de `t-001` en `pendientes` → `applied`, `changed: true`; después de `idle()`, `renders()` aumentó en **2** (`pendientes` y `resumen`; `agenda` no), la huella de `agenda` no cambió, la de `pendientes` sí, y el centro de la casilla de `t-001` `(25, 109)` es negro. La misma acción (mismo `id`) → `duplicate` y nada cambia. `toggle` sobre una zona de `agenda` → `stale`; `open` sobre una zona de `pendientes` → `stale`; una zona `zffffffffff` → `stale`.
- **CA14 (caché compartida).** Con `devices` = `{ "*": [pendientes, agenda, resumen], "p2": [agenda] }`: `index("p1", P124)` dibuja 3 vistas (`renders() = 3`); `index("p2", P124)` trae solo `agenda` y `renders()` sigue en 3; `view("p2", P124, "pendientes", <huella>)` → `unknown_view`; `index("p1", P200)` dibuja otras 3 (`renders() = 6`).
- **CA15 (cambio de día).** Después de un `index` con reloj `2026-10-23T12:00:00Z`, otro `index` con el reloj en `2026-10-24T00:00:01Z` redibuja las 3 vistas (la fecha de la barra cambió), y en `agenda` ya no está la zona de `e-002`.
- **CA16 (espera y `busy`).** Con un `Renderer` falso que tarda 3000 ms, el primer `index` responde `busy` (`retryAfterS: 5`) en menos de 2,5 s; después de `idle()`, `index` responde bien sin volver a dibujar. Por HTTP (`createApp` con ese motor), el mismo caso da **503** con `Retry-After: 5` y un `ErrorBody` válido `busy`.
- **CA17 (huellas y errores por HTTP).** Con `createApp({ …, engine })` y los ejemplos: `GET /api/v1/index` pasa `validateIndex` con `views` = `pendientes`, `agenda`, `resumen` y `current = "pendientes"`; la imagen y las zonas de cada vista responden con su huella; `h` vieja → **409** `stale_view`; vista `nada` → **404** `unknown_view`.
- **CA18 (texto peligroso).** Una tarea con título `<img src="http://example.invalid/x"><script>document.title=1</script></style><style>*{display:none}</style>` se dibuja como texto: la fila existe (su zona está), `gray = 0`, y `blockedRequests()` **no** aumenta. En cambio, `render` de un HTML escrito a mano con `<img src="http://example.invalid/x">` termina bien y **sí** aumenta `blockedRequests()` (el bloqueo funciona).
- **CA19 (ciclo con el emulador).** `npm run server -- --port 0 --views config/views.example.json --data config/data.example.json` arranca su propio Chromium; `runWake` del emulador (`power: "usb"`, panel `P124`) baja las 3 vistas sin errores y `screen.raw1` es byte a byte la imagen de `pendientes` del servidor; `press(ok)` (foco en la primera zona) marca `t-001` y, tras la siguiente despertada, el centro de su casilla `(25, 109)` es negro. Al mandar SIGTERM al servidor, en menos de 15 s no queda ningún contenedor `tintero-chromium-*` suyo.
- **CA20 (vista previa).** `npm run render -- --views config/views.example.json --data config/data.example.json --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-23T12:00:00Z --out <tmp>` sale con 0 y escribe `pendientes.png`, `agenda.png`, `resumen.png` (cada uno pasa `checkImage("png1", …)` con ese panel), los tres `*.zones.png` y los tres `*.zones.json` (cada uno pasa `validateZones`; el de `pendientes` tiene 7 zonas).
- **CA21 (registro).** Durante CA19, el registro tiene una línea `{ "ts", "render", "ms", "ok" }` por dibujo y no contiene ningún título ni categoría de los datos de ejemplo.
- **CA22 (sin motor, igual que antes).** `npm run test:acceptance -- tests/acceptance/F-003 tests/acceptance/F-004` pasa.

## Presupuestos
- Una vista de 800 × 480 con el contenedor ya arrancado: **< 500 ms** (medido: 100–200 ms).
- `startChromium()` con la imagen descargada: **< 30 s** (medido: ~2 s).
- `index` con todo dibujado, y una imagen ya en caché: **< 50 ms** cada uno. `POST /api/v1/actions`: **< 50 ms** (el dibujo va en segundo plano).
- Memoria del contenedor: tope de **512 MB** (`--memory`).

## Seguridad
- [x] Toda entrada externa con **límite de tamaño antes de parsear**: vistas ≤ 64 KiB, datos ≤ 512 KiB, PNG de Chromium (medidas antes de descomprimir y `maxOutputLength`), textos con los largos del *Contrato*.
- [x] Servicios locales solo en **127.0.0.1**: el puerto CDP se publica solo en `127.0.0.1`; `--chromium` solo acepta `http://127.0.0.1:<puerto>`.
- [x] Dependencias nuevas nombradas arriba: `playwright-core` (zona sensible); la imagen de Chromium, fijada por *digest*.
- **Lo que se dibuja no puede salir a la red:** todo texto de los datos pasa por el escape de HTML (`& < > " '`); el HTML se arma solo con una función de plantilla que escapa cada valor interpolado; la página lleva CSP `default-src 'none'; style-src 'unsafe-inline'`; JavaScript apagado; toda petición se bloquea; ningún CSS usa `url()` ni `@font-face` (las letras salen de fontconfig). Se comprueba en CA18.
- **Contenedor endurecido** (CA4): solo lectura, sin capacidades, `no-new-privileges`, topes de memoria y de procesos, fuentes de solo lectura, sin red del host.
- **Excepción documentada:** la conexión CDP al Chromium local va por `http://127.0.0.1` sin TLS (no sale de la máquina). El arquitecto la agrega a `docs/seguridad.md` antes de programar, con la misma forma que la excepción de las pruebas (una sola función con el único acceso marcado).
- S1: el aparato solo recibe imágenes y zonas con ids opacos (CA6). S6: el registro y los errores no llevan contenido (CA2, CA21).
- `server/src/engine/chromium.ts` y `server/src/engine/html.ts` pasan a ser **zona sensible** (los agrega el arquitecto a `tools/sensitive-paths.txt`).

## Archivos
- **Los prepara el arquitecto antes de programar** (después de la puerta 1): `server/fonts/` (`LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf`, `LICENSE` de la OFL, `fonts.conf` sin suavizado y `README.md`); `CHROMIUM_IMAGE` en `tools/images.conf`; `tools/sensitive-paths.txt`; la excepción de CDP en `docs/seguridad.md`; los ADR de D1–D6. Ya están, con esta ficha: `config/views.example.json` y `config/data.example.json`.
- A crear: `server/src/engine/` (`index.ts`, `units.ts`, `config.ts`, `theme.ts`, `layout.ts`, `html.ts`, `blocks/*.ts`, `dates.ts`, `png.ts`, `chromium.ts`, `engine.ts`, y sus `*.test.ts`; se puede repartir distinto mientras `index.ts` exporte lo del *Contrato*); `server/scripts/render.ts` y su prueba.
- A tocar: `server/src/app.ts`, `server/src/args.ts`, `server/src/main.ts`, `server/src/index.ts` (exporta el motor), `server/README.md`, `package.json` (`playwright-core` y el script `render`), `package-lock.json`, `knip.json` (entradas `server/src/engine/index.ts` y `server/scripts/*.ts`).

## Resultado esperado
`npm run server -- --views config/views.example.json --data config/data.example.json` + el emulador muestran tres vistas reales (pendientes por categoría, agenda y un resumen en dos columnas); con `Tab` y Aceptar se marca una tarea y la pantalla cambia; Aceptar sobre un evento abre su detalle. `npm run render` deja las mismas imágenes en PNG para revisarlas con las zonas encima. F-006 solo tiene que entregar tareas en el tipo común.

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto).
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Al cerrar, con `docs/plantillas/resumen-aprobacion.md`.)*
