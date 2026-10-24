# F-005 · Motor de vistas

**Estado:** borrador v3: espera la puerta 1. Aprobadas por el dueño el 2026-10-23: D2 y D6 (con sus ajustes), D3, D4 y D7. Faltan **D1** y **D5** (la letra: ronda 2 de pruebas hecha).
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** **`playwright-core`** 1.64.1 (D1): maneja el Chromium sin interfaz por CDP. Licencia Apache-2.0, **sin dependencias propias** y sin scripts de instalación (no baja navegadores). Chromium **no** es un paquete npm: corre en Docker, con la imagen fijada por *digest* en `tools/images.conf` (`CHROMIUM_IMAGE`). Las letras van como archivos en el repo, con sus licencias (D5).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** | **¿Cómo se dibuja?** *(el dueño se inclina por CSS, 2026-10-23)* | **HTML/CSS en un Chromium sin interfaz**, en un contenedor Docker endurecido que solo escucha en `127.0.0.1`, manejado con `playwright-core` por CDP. **Nitidez:** el texto se dibuja **sin suavizado** (fontconfig: `antialias=false`, *hinting* completo), así que la captura sale en blanco y negro puros; con letras de píxeles en su tamaño nativo, cada letra cae exacta en la cuadrícula. Todo detrás de una interfaz `Renderer`, para cambiar de motor sin tocar lo demás | **Medido** (ver *Lo verificado* y la nota de investigación «Nitidez y letras en e-ink»): **0 píxeles grises**, 180–370 ms por vista completa, y las zonas salen de la posición de los elementos. Con CSS la nitidez **no se pierde**: con las mismas letras, Chromium entrega los mismos píxeles que un dibujo propio; lo que decide es la letra (D5). CSS además resuelve solo las columnas que dependen del texto (p. ej. el ancho de la hora) |
| | Alternativas | **(b) Satori + resvg** (sin navegador): 10–15 paquetes, CSS parcial, texto suavizado que hay que umbralizar (trazos desparejos, medido), zonas calculadas aparte. **(c) Dibujo propio con letras de píxeles**: 0 dependencias y nítido, pero cada diseño se programa en TypeScript y los tamaños son fijos | (b) da peor texto a 1 bit; (c) choca con «diseños escalables» y con aportar diseños |
| **D2** ✅ | **¿Cómo se arma una vista?** | **Aprobado (dueño, 2026-10-23), con dos ajustes suyos:** (1) **la distribución es fija** y la define la vista (una cuadrícula con áreas con nombre; opcionalmente otra para panel vertical); (2) **cada bloque es dueño de su diseño**, incluido qué hace con el texto que no cabe (los pendientes: una línea con «…»; Jira: «id · estado», el título y, si se pide, la descripción). **Nunca** hay desplazamiento ni filas cortadas: el bloque calcula cuántos elementos caben y pone «+N más»; y el motor **revisa después de dibujar** que nada se salga de su espacio, ni a lo alto ni a lo ancho. Cuatro capas (perfil de panel, distribución, bloque, tema), todo en unidades físicas | Requisito «diseños escalables» (F14) y el caso del dueño: una vista con pendientes, Jira, próximos eventos y calendario, con 10 pendientes en un cuarto de pantalla |
| **D3** ✅ | ¿Dónde se configura qué vistas tiene cada pantalla? | **Aprobado (dueño, 2026-10-23): un JSON de prueba** fuera del repo (`--views`), con ejemplo en `config/views.example.json`. Se lee al arrancar | La web (F2) y la base de datos llegan en su propia ficha |
| **D4** ✅ | ¿De dónde salen los datos? | **Aprobado (dueño, 2026-10-23): un JSON de prueba** (`--data`, M4; ejemplo en `config/data.example.json`) con los tipos comunes `tasks` y `events`. Una fuente puede ser de **solo lectura** (como Jira). Marcar una tarea la cambia **en memoria** | F-006 reemplaza la fuente de tareas por el tablero de Trilium |
| **D5** | **¿Qué letra?** *(el dueño dejó solo Terminus y DejaVu y pidió probar las de byonk; ronda 2 hecha el 2026-10-23)* | **La letra es parte del tema**: cambiarla no toca el motor. El tema declara sus letras: las **de mapa de bits** con la lista exacta de tamaños que traen, y una **de contorno** de respaldo (**DejaVu Sans**). Para el texto, escoger entre **X11Helv** (Helvetica de mapa de bits, proporcional, la más legible; licencia y arreglo por confirmar), **Terminus** (monoespaciada, OFL; en su versión TTF sirve en cualquier tamaño) o **DejaVu Sans** sola | Ronda 2 (nota «Nitidez y letras en e-ink»): (1) Chromium **no dibuja** las X11 de byonk tal como vienen (sin tabla `glyf`) y usa otra letra en silencio; con una tabla `glyf` vacía agregada por nosotros, sí; (2) una letra de mapa de bits en un tamaño que no trae **no se dibuja**: el motor solo puede usar sus tamaños exactos; (3) las X11 tienen grosores desparejos entre tamaños: cada tamaño del tema se escoge mirándolo. **La decisión final, en el panel real** (M9) |
| **D6** ✅ | **¿Cuándo se hacen las imágenes?** | **Aprobado (dueño, 2026-10-23): el servidor redibuja cuando tiene información nueva, venga de donde venga**, y la imagen tiene que estar lista **antes** de que la pantalla despierte: (1) **un servicio le avisa** o le entrega datos (las integraciones llaman a `setSource`); (2) **la pantalla** manda una acción; (3) **una actualización programada** que corre antes de la próxima despertada de cada pantalla (el servidor sabe cuándo vuelve: `next_wake_s`) y dibuja para la hora en que la pantalla va a despertar (p. ej. el cambio de día). La espera de 2 s con `503 busy` + `Retry-After: 5` queda solo como red de seguridad (primera vez que aparece un panel). Dos pantallas con la misma vista comparten la imagen | Lo que gasta batería es el WiFi encendido esperando: el servidor nunca debe dibujar mientras la pantalla espera |
| **D7** ✅ | ¿Qué vista muestra el aparato al despertar? | **Aprobado (dueño, 2026-10-23):** en F-005, `current` es la primera vista del aparato (o el detalle, solo en el índice que sigue a abrirlo). **F-008** (ficha aparte) hará que el aparato informe su vista actual (cabecera opcional `Tintero-View`, compatible con v1) | Hoy, cada despertada devuelve la pantalla a la primera vista |

## Lo verificado por el arquitecto (2026-10-23)
- [x] **Chromium en Docker, sin suavizado:** imagen `chromedp/headless-shell` (Chrome 156, 157 MB, Debian 13) con `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, CDP solo en `127.0.0.1`, letras montadas de solo lectura y un `fonts.conf` con `antialias=false` + `hintstyle=hintfull` + `embeddedbitmap=true`. Flags `--font-render-hinting=full --disable-font-subpixel-positioning --disable-lcd-text`. Resultado: **0 píxeles grises** con 9 letras de contorno y 4 de píxeles; con suavizado, la misma hoja dio 78 760 grises y trazos desparejos a 8–10 pt.
- [x] **Vista completa de 4 bloques** (pendientes, Jira, próximos eventos, calendario del mes) en 800 × 480 con 6 letras: 0 grises, ningún bloque desbordado, **180–370 ms** por vista por CDP. Con letras anchas, la columna fija de la hora se montó sobre el título: por eso las columnas se dejan a CSS (`max-content`) y la revisión de desbordes mira también a lo ancho.
- [x] `playwright-core` por CDP (`connectOverCDP`), contexto con `javaScriptEnabled: false`, toda petición bloqueada, CSP `default-src 'none'`: leer cajas y medidas de elementos con `$$eval` funciona igual con JavaScript apagado.
- [x] Letras: TRMNL12/16/21 (OFL 1.1, Heavyweight Digital Type Foundry; archivos en el repositorio del framework de TRMNL, código MIT), DejaVu Sans (licencia Bitstream Vera, libre).
- [x] **Ronda 2 de letras** (Terminus, DejaVu y las de byonk): las letras de mapa de bits **sin tabla `glyf`** (las X11 de byonk) no se dibujan en Chromium (las cambia por otra sin avisar); con una tabla `glyf` vacía agregada con fontTools, sí. Una letra de mapa de bits en un tamaño que no trae sale **en blanco**. Las 9 vistas de prueba: 0 grises (1 píxel en la punta del tachado, que el umbral resuelve) y, después de ajustar el calendario de la maqueta (la revisión lo detectó saliéndose 21 px), ningún desborde.
- [x] Contenedor listo para CDP: ~2 s con la imagen ya descargada. `playwright-core` 1.64.1 (2026-10-14): Apache-2.0, sin dependencias, 13,7 MB.

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] Nombres de archivos, rutas, puertos y URLs escritos: ejemplos `config/views.example.json` y `config/data.example.json` (los escribe el arquitecto con esta ficha; **nadie más los modifica**), contenedores `tintero-chromium-<sufijo>`, puerto CDP efímero en `127.0.0.1`, zona horaria `UTC` (y `America/Lima` en CA12).
- [x] Toda función que se prueba tiene nombre y firma; `renders()` cuenta **desde que se crea el motor** (`createEngine`).

## Contexto
F-003 sirve vistas de demostración dibujadas a mano. Esta ficha arma el **motor de vistas** del documento 4: distribuciones, bloques, perfil de panel, paso a 1 bit y mapa de zonas, con datos de prueba (M4), para que las integraciones (F-006 en adelante) solo tengan que entregar datos. Aplican ADR-0001 (el servidor dibuja), ADR-0006 (navegación B con C progresiva), ADR-0009 (los bloques no conocen la integración), ADR-0010 (los atributos de las tareas se deciden con los diseños) y D5 de F-001 (unidades físicas).

## Alcance
- Unidades físicas → píxeles; tema `base` con su letra (D5).
- Archivo de vistas (cuadrícula fija con áreas, D2) y archivo de datos de prueba (D4): esquemas, límites y carga.
- Bloques: `task-list`, `issue-list`, `agenda`, `month-calendar` y el detalle de un elemento.
- Regla de «cabe / +N más» por bloque, y revisión de desbordes después de dibujar.
- Dibujo con Chromium en Docker (D1): contenedor, conexión, captura, paso a 1 bit, cajas de zonas, medidas de desborde.
- Motor: huellas, caché compartida, cola de dibujo (D6), estado por aparato (vista actual y detalle abierto), acciones `toggle` y `open`.
- Servidor: con `--views` y `--data`, sirve las vistas del motor; sin ellos, la demostración de F-003 igual que hoy.
- Vista previa (`npm run render`): la misma imagen que recibe el aparato, más una copia con las zonas marcadas (F4).

**Fuera de alcance:** integraciones reales y su núcleo (F-006 en adelante); web de configuración y base de datos; usuarios; el planificador (`next_wake_s` sigue saliendo de `--next-wake-s`); tramado de fotos; `png1`; grises; paginar listas con `Tab`; F-008; empaque en Docker Compose; la elección final de letra (M9).

## Requisitos
- R1. Código en `server/src/engine/`, con pruebas unitarias. Las pruebas unitarias **no** necesitan Docker (usan un `Renderer` falso); las del Chromium real van en las de aceptación, y el programador puede probar a mano con `npm run render`.
- R2. Todo lo que entra (archivo de vistas, archivo de datos, PNG de Chromium) se limita en tamaño **antes** de parsearlo; los archivos se leen con la lectura con tope (regla `tintero-lectura-sin-tope`).
- R3. `server/README.md`: cómo arrancar con vistas y datos, cómo ver la vista previa y **cómo se escribe un bloque nuevo** (su diseño, su regla de «cabe», sus zonas), para los diseños que vienen.
- R4. Lo que no cambie esta ficha sigue igual: las pruebas de aceptación de F-001 a F-004 pasan.

## Contrato

### Unidades y letra (`server/src/engine/units.ts`, `theme.ts`)
```ts
export function mmToPx(mm: number, dpi: number): number; // max(1, round(mm × dpi / 25,4))
export function ptToPx(pt: number, dpi: number): number; // max(1, round(pt × dpi / 72))
export interface ThemeFont { family: string; kind: "bitmap" | "outline"; sizes?: number[] } // sizes: solo bitmap, los que trae
export function pickFont(px: number, fonts: ThemeFont[]): { family: string; px: number };
```
`pickFont` (D5): entre las letras `bitmap` de `fonts`, escoge el **tamaño exacto** que traen más cercano a `px` (empate → el más grande; empate entre letras → la primera de la lista). Si la diferencia pasa del **15 %** de `px`, o no hay letras `bitmap`, devuelve la primera `outline` con `px` tal cual. **Nunca** devuelve una letra de mapa de bits en un tamaño que no trae (no se dibujaría). Las letras del tema tienen normal y negrita.

### Tema `base` (unidades físicas)
| Elemento | Valor | A 124 ppp | A 200 ppp |
|----------|-------|-----------|-----------|
| Margen interior de cada espacio (`M`) | 2 mm | 10 px | 16 px |
| Barra de título (`B`) | 7 mm | 34 px | 55 px |
| Línea bajo la barra y divisores (`L`) | 0,5 mm | 2 px | 4 px |
| Fila de título de bloque (si el espacio tiene `title`) | 5 mm | 24 px | 39 px |
| Encabezado de grupo (categoría o día) | 4,5 mm | 22 px | 35 px |
| Fila de `task-list` y de `agenda` | 5 mm | 24 px | 39 px |
| Fila de `issue-list` / con descripción | 9 mm / 13 mm | 44 / 63 px | 71 / 102 px |
| Fila «+N más» | 4,5 mm | 22 px | 35 px |
| Casilla: lado / borde | 3 mm / 0,5 mm | 15 / 2 px | 24 / 4 px |
| Letra: títulos / texto / detalles | 12 pt / 9 pt / 7 pt | 21 / 16 / 12 px | 33 / 25 / 19 px |

Cada tamaño pasa por `pickFont` con las letras del tema (D5). Letra mínima: 7 pt. Todo se posiciona en **píxeles enteros**.

### Archivo de vistas (`--views`, ≤ 64 KiB; ejemplo `config/views.example.json`)
- `version`: 1. `timezone`: zona IANA que acepte `Intl.DateTimeFormat`. `theme`: `"base"`.
- `devices`: claves = id de aparato (`^[a-z0-9-]{1,32}$`; sin TLS el aparato es `local`) o `"*"` (**obligatorio**). `views`: 1–15 ids existentes (deja lugar para un detalle: el índice admite 16).
- `views[]` (1–32): `id` `^[a-z0-9_]{1,14}$` sin repetir (los detalles se llaman `<id>-d`); `title` 1–40 caracteres; `grid`; `portrait?`; `slots`; `tab?`.
- **`grid`** (y `portrait`, que se usa si el panel es vertical, `h > w`): `columns` y `rows`: 1–4 porcentajes enteros, cada uno 10–90 (o 100 si es el único), que suman 100; `areas`: matriz de `rows.length` × `columns.length` con nombres `^[a-z0-9_]{1,16}$`; cada nombre ocupa un **rectángulo** (como `grid-template-areas` de CSS); como mucho 8 áreas. `portrait` usa los mismos nombres que `grid`.
- **`slots`**: un objeto por área (ni más ni menos): `block`, `source`, `title?` (1–40; si está, el bloque muestra su fila de título), `options?`.
- **`tab?`**: orden de `Tab` entre espacios (lista de áreas sin repetir; las que falten van después en el orden por defecto). Por defecto: por la celda de arriba a la izquierda de cada área, fila por fila, de izquierda a derecha.
- Bloques y fuentes: `task-list`, `issue-list` → fuente `tasks`; `agenda`, `month-calendar` → fuente `events`. Opciones: `task-list` `{ "group_by": "category" | "none" }` (por defecto `category`); `issue-list` `{ "description": boolean }` (por defecto `false`); `agenda` `{ "days": 1–14 }` (por defecto 7); `month-calendar` sin opciones.
- **Campos desconocidos → error** (archivo del dueño: así se atrapan errores de tipeo).

### Archivo de datos de prueba (`--data`, ≤ 512 KiB; ejemplo `config/data.example.json`)
- `{ "version": 1, "sources": { "<id>": { "type": "tasks" | "events", "readonly"?: boolean, "items": [...] } } }`; ids de fuente `^[a-z0-9_]{1,32}$`, 1–16 fuentes, 0–500 elementos por fuente, ids de elemento `^[A-Za-z0-9_-]{1,64}$` sin repetir en la fuente. `readonly` (por defecto `false`): nada de esa fuente se puede marcar. Campos desconocidos → error.
- **`Task`**: `id`, `title` (1–200), `done` (booleano), `category?` (1–40), `due?` (`AAAA-MM-DD`), `key?` (1–24, p. ej. `PROJ-142`), `status?` (1–24), `description?` (1–1000).
- **`CalendarEvent`**: `id`, `title` (1–200), `start` (fecha y hora RFC 3339 con zona, o `AAAA-MM-DD` = todo el día), `end?` (del mismo tipo y no antes), `location?` (1–100), `notes?` (1–1000).

### Carga (`server/src/engine/config.ts`)
```ts
export class ConfigError extends Error {}  // mensaje: "<archivo>: <ruta JSON Pointer>: <motivo>" o "<archivo>: too large"
export function parseViewsConfig(raw: string): ViewsConfig;               // lanza ConfigError
export function parseDataFile(raw: string, config: ViewsConfig): DataFile; // lanza ConfigError (también si una vista usa una fuente que falta o de otro tipo)
export function loadViewsConfig(path: string): ViewsConfig;               // lectura con tope de 65 536 bytes
export function loadDataFile(path: string, config: ViewsConfig): DataFile; // lectura con tope de 524 288 bytes
```
El texto de `ConfigError` nunca incluye valores del archivo (títulos, notas): solo la ruta y el motivo.

### Distribución: de la cuadrícula a rectángulos (`server/src/engine/layout.ts`)
```ts
export interface SlotRect { area: string; x: number; y: number; w: number; h: number }
export function slotRects(grid: Grid, panel: Panel): SlotRect[];   // en el orden de Tab por defecto
```
- Cuerpo: de `y0 = B + L` al borde inferior (`altoCuerpo = h − y0`); la línea bajo la barra ocupa `y = B … B + L − 1`.
- Límites de columna `c_k = round(w × (suma de los k primeros porcentajes) / 100)`; de fila `r_k = y0 + round(altoCuerpo × (suma de los k primeros) / 100)`.
- Un área que empieza en la columna `i` arranca en `x = 0` si `i = 0`, o en `x = c_i + L`; termina (sin incluir) en `c_{j+1}` o en `w` si es la última. Igual con las filas. El divisor (negro, de grosor `L`) ocupa `c_k … c_k + L − 1` (o `r_k …`) donde separa dos áreas distintas.
- El contenido de cada espacio empieza a `M` de sus bordes.

### Bloques (cada uno dueño de su diseño)
**Regla común de «cabe»:** las filas tienen el alto que fija su diseño (tabla del tema) y van una debajo de otra, en orden. Un encabezado de grupo solo se pone si cabe con al menos una fila suya. **Si no cabe todo**, se reserva al final una fila «+N más» (N = elementos que no se muestran) y se ponen filas mientras quepan en el resto; **en cuanto una no cabe, se para** (no se salta a otra). La fila «+N más» no recibe el foco. **Nunca** hay desplazamiento, filas cortadas ni texto montado: lo que no cabe en su línea termina en «…» donde el diseño lo dice. Si el espacio es más chico que el mínimo del bloque, el bloque solo escribe «No cabe» y el motor lo anota (`tooSmall`). Todo texto de los datos se escapa (ver *Seguridad*).

| Bloque | Tipo | Diseño | Zonas | Mínimo |
|--------|------|--------|-------|--------|
| **`task-list`** | `tasks` | Con `group_by: "category"`: categorías en el orden en que aparecen, las sin categoría al final bajo «Sin categoría». Fila: casilla (`x` = margen izquierdo, `y` = arriba de la fila + `floor((alto − lado) / 2)`), título en **una línea con «…»**, y `due` a la derecha (`25 oct`). Hecha = casilla rellena y título tachado. En una fuente `readonly`, sin casilla | `toggle` por fila (`open` si la fuente es `readonly`) | 30 mm × (título + 1 encabezado + 1 fila + «+N más») |
| **`issue-list`** | `tasks` | Sin grupos. Fila: línea 1 en detalles y negrita `key · status` (lo que exista); línea 2 el título en **una línea con «…»**; con `description: true`, línea 3 la descripción en detalles, una línea con «…» | `open` por fila | 30 mm × (título + 1 fila + «+N más») |
| **`agenda`** | `events` | Eventos de hoy a hoy + `days` − 1 (día local en `timezone`; los de hoy salen todos aunque ya pasaron). Encabezado por día `VIE 23 OCT`. Dentro del día, primero los de todo el día y luego por hora (empate: orden de los datos). Fila: hora `HH:MM` o «Todo el día» en una columna **del ancho del texto más largo** (CSS `max-content`) y el título con «…» | `open` por fila | 40 mm × (título + 1 encabezado + 1 fila + «+N más») |
| **`month-calendar`** | `events` | Mes de hoy: encabezado `OCTUBRE 2026` (si el espacio no tiene `title`), fila de días `L M M J V S D` (semana desde el lunes) y las semanas del mes repartidas en el alto que queda; **hoy invertido** (blanco sobre negro); días con eventos, subrayados | ninguna | 50 mm × 35 mm |
| **detalle** (lo usa el motor) | ambos | Vista `<id>-d`, `parent: "<id>"`, cuadrícula de un área, sin zonas. Barra «Detalle». Evento: título (negrita, hasta 3 líneas), `vie 23 oct · 14:00–14:30` (o `· todo el día`), lugar, notas cortadas con «…». Tarea: `key · status`, título (hasta 3 líneas), `due`, descripción cortada con «…» | ninguna | — |

**Barra de título** (toda vista): a la izquierda el `title`; a la derecha la fecha local de hoy (`vie 23 oct`). Días `dom lun mar mié jue vie sáb`; meses `ene feb mar abr may jun jul ago sep oct nov dic`; 24 h. **Sin** textos relativos al tiempo.

### Revisión de desbordes (después de dibujar)
Cada bloque marca con `data-fit="<área>"` su contenedor y cada fila. Después de `setContent`, el `Renderer` revisa esos elementos: si alguno tiene `scrollHeight > clientHeight` o `scrollWidth > clientWidth`, devuelve su área en `overflow`. Los textos con «…» no cuentan (se cortan a propósito, dentro de su fila). Una vista con `overflow` no vacío se registra (`{ "ts", "render", "overflow": [...] }`) y **las pruebas la dan por mala**.

### Zonas
- Cada elemento con foco lleva `data-zone`; el `Renderer` devuelve su caja (`x, y, w, h` enteros).
- **Id de zona** (opaco y estable aunque cambie la lista): `zoneId(viewId, sourceId, itemId)` = `"z"` + los primeros **10** dígitos hexadecimales del SHA-256 de `` `${viewId}\n${sourceId}\n${itemId}` ``. Nunca sale al aparato el id ni el texto del elemento (S1).
- **Orden de `Tab`:** espacio por espacio según `tab` (o el orden por defecto) y, dentro de cada uno, el orden de las filas. Cada zona dentro del panel y de al menos 8 px; como mucho **48** por vista (las demás filas se dibujan sin foco).

### Dibujo (`server/src/engine/chromium.ts`, `png.ts`)
```ts
export interface Box { key: string; x: number; y: number; w: number; h: number }
export interface RenderOutput { raw1: Uint8Array; gray: number; boxes: Box[]; overflow: string[] }
// gray: píxeles de la captura que no eran ni negro ni blanco puros, contados antes del umbral.
export interface Renderer {
  render(html: string, panel: Panel): Promise<RenderOutput>;
  blockedRequests(): number;   // peticiones que intentó la página y se bloquearon, desde que se creó
  close(): Promise<void>;
}
export function chromiumDockerArgs(name: string, port: number, fontsDir: string, image: string): string[];
export function startChromium(options?: { port?: number }): Promise<{ endpoint: string; name: string; stop(): Promise<void> }>;
export function chromiumRenderer(endpoint: string, options?: { timeoutMs?: number }): Promise<Renderer>;
export function decodePng(bytes: Uint8Array, panel: Panel): Uint8Array;   // luminancia 8 bits por píxel, w × h
export function toRaw1(gray: Uint8Array, panel: Panel): Uint8Array;       // < 128 → negro (1); formato raw1 de F-001
```
- **Contenedor:** `chromiumDockerArgs` arma `run --rm -d --name <name> -p 127.0.0.1:<port>:9222 --read-only --tmpfs /tmp:size=64m --cap-drop ALL --security-opt no-new-privileges --memory 512m --pids-limit 256 --mount type=bind,source=<fontsDir>,target=/tintero/fonts,readonly -e FONTCONFIG_FILE=/tintero/fonts/fonts.conf <image> --font-render-hinting=full --disable-font-subpixel-positioning --disable-lcd-text`. Sin `-v`, sin `--privileged`, sin `--network host`, sin `0.0.0.0`.
- `startChromium`: nombre `tintero-chromium-<8 hex al azar>`; `port` 0 (por defecto) = puerto libre (lo lee de `docker port`); imagen `CHROMIUM_IMAGE` de `tools/images.conf`; letras de `server/fonts/`. Llama a `docker` **sin shell** (`execFile`). Espera hasta **30 s** a que `GET http://127.0.0.1:<port>/json/version` responda; si no, detiene el contenedor y falla. `endpoint` = `http://127.0.0.1:<port>`. `stop()` lo detiene (con `--rm`, desaparece).
- `chromiumRenderer`: `connectOverCDP(endpoint)`; cada `render` usa un contexto nuevo con `viewport = { width: panel.w, height: panel.h }`, `deviceScaleFactor: 1`, `javaScriptEnabled: false`; **bloquea toda petición** (`route` → `abort`, contándola); `setContent(html)`; lee cajas (`data-zone`) y desbordes (`data-fit`); captura PNG; cierra el contexto. Tiempo máximo: `timeoutMs` (10 000). Si la conexión se cayó, el siguiente `render` reconecta una vez.
- `decodePng`: solo lo que entrega Chromium: PNG de 8 bits, RGB o RGBA, sin entrelazar, filtros 0–4. Comprueba las medidas **antes** de descomprimir y descomprime con `maxOutputLength = h × (1 + w × 4)`. Luminancia = `round(0,299 R + 0,587 G + 0,114 B)`. Cualquier otra cosa → error.

### Motor (`server/src/engine/engine.ts`; todo se exporta en `server/src/engine/index.ts`)
```ts
export interface EngineOptions {
  config: ViewsConfig; data: DataFile; renderer: Renderer;
  clock?: () => Date;      // por defecto, la hora del sistema
  renderWaitMs?: number;   // por defecto 2000
  nextWakeS: number;       // el mismo que manda el índice (--next-wake-s)
  prewarmLeadS?: number;   // por defecto 60: cuánto antes de la despertada se prepara
}
export interface RenderedView {
  id: string; parent?: string; raw1: Uint8Array; zones: Zone[];
  hash: string; crc32: string;
  hidden: Record<string, number>;  // por área: cuántos elementos no se mostraron
  overflow: string[]; tooSmall: string[];
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
  setSource(id: string, items: unknown): { ok: true; changed: boolean } | { ok: false; error: string };
  prewarm(): Promise<void>; // prepara lo de las pantallas que despiertan dentro de prewarmLeadS
  idle(): Promise<void>;   // se resuelve cuando la cola de dibujo está vacía
  renders(): number;       // llamadas a renderer.render desde createEngine
  close(): Promise<void>;
}
export function createEngine(options: EngineOptions): Engine;
export function zoneId(viewId: string, sourceId: string, itemId: string): string;
```
- **Vistas de un aparato:** las de su entrada en `devices` (o las de `"*"`), en ese orden, más `<id>-d` (con `parent`) si abrió un detalle desde `<id>`; el detalle sigue en la lista hasta que abra otro.
- **`current`** (D7): la primera vista del aparato; en el **primer** `index` después de un `open` aplicado, el detalle; desde el siguiente, otra vez la primera.
- **Huella:** como en F-003, los primeros 16 dígitos hexadecimales del SHA-256 de la imagen más el JSON de sus zonas.
- **Caché y clave de dibujo:** una vista se redibuja solo si cambia su clave: la definición de la vista, el tema, los datos de **sus** fuentes, el detalle abierto (solo `<id>-d`), la fecha local de hoy y el panel. Misma clave → misma imagen, sin dibujar, aunque la pidan varios aparatos. Caché con expulsión de la menos usada, **256** entradas.
- **Cuándo se dibuja (D6):** un dibujo a la vez, en una cola. Se encolan las vistas afectadas, para **cada aparato y panel ya vistos**, cuando: (1) `setSource` cambia datos; (2) un `apply` cambia algo; (3) `prewarm` encuentra un aparato cuya próxima despertada (hora de su último `index` + `nextWakeS`) cae dentro de `prewarmLeadS`: calcula sus claves **con la fecha de esa despertada** y encola lo que falte. El servidor llama a `prewarm` cada 30 s. `index` encola lo que todavía falte (panel nuevo) y **espera** los dibujos pendientes de las vistas de ese aparato hasta `renderWaitMs`; si no terminan → `busy` (siguen en la cola). Un dibujo que falla no borra la imagen anterior; si nunca hubo una, esa vista da `busy`.
- **`setSource`:** valida `items` con las mismas reglas del archivo de datos para el tipo de esa fuente (fuente que no existe o elementos inválidos → `{ ok: false }` con un motivo sin contenido); `changed` es `false` si los datos quedan iguales. Es la puerta por la que entrarán las integraciones (F-006).
- **`view`:** vista que no es del aparato → `unknown_view` (aunque exista para otro); sin dibujo para ese panel o con otra huella → `stale_view`.
- **`apply`:** idempotente por `id` (recuerda los últimos 1000): la segunda vez, `duplicate` sin aplicar. `toggle` sobre una zona de `task-list` de una fuente que no es `readonly`, en una vista del aparato → invierte `done` **en memoria** (para todas las vistas y aparatos que usan esa fuente). `open` sobre una zona de `agenda`, `issue-list` o de `task-list` `readonly` → abre el detalle de ese elemento para ese aparato. Cualquier otra combinación → `stale`. Las zonas se resuelven con `zoneId` sobre **todos** los elementos de las fuentes de la vista (no solo los visibles): una acción guardada sin red sigue apuntando al mismo elemento aunque la lista cambie.

### Servidor
- `npm run server -- … --views <archivo> --data <archivo> [--chromium <url>]`. `--views` y `--data` van juntos (si falta uno → sale con **2**). Un `ConfigError` → sale con **2** y su mensaje. Sin `--chromium`, el servidor arranca su propio contenedor con `startChromium()` y lo detiene al salir (Ctrl+C / SIGTERM). `--chromium` solo acepta `http://127.0.0.1:<puerto>`.
- `ServerConfig` gana `engine?: Engine`. Con motor, las rutas usan el motor (el aparato es el id de la lista de aparatos con TLS, o `local` sin TLS); `503 busy` lleva `Retry-After: 5` y `ErrorBody`; `createApp(...).renders()` devuelve `engine.renders()`. Sin motor, todo sigue como en F-003/F-004.
- Registro (S6): una línea por dibujo `{ "ts", "render", "ms", "ok" }` (más `overflow` o `tooSmall` si los hay), sin contenido.

### Vista previa (`server/scripts/render.ts`, `npm run render -- …`)
```
--views <archivo> --data <archivo> --panel w=800,h=480,dpi=124,depth=1 --out <carpeta>
[--device <id> (por defecto "*")] [--now <fecha RFC 3339>] [--chromium <url>]
```
Por cada vista del aparato escribe `<id>.png` (PNG de 1 bit, la misma imagen que recibe el aparato; puede reutilizar `encodePng1` del emulador), `<id>.zones.png` (con el borde de cada zona invertido, 2 px) y `<id>.zones.json` (un `ZonesResponse`). Crea `--out` si no existe. Sale con 0, o con 2 ante opciones o archivos inválidos; si alguna vista tiene `overflow`, lo dice y sale con **1**.

## Criterios de aceptación
Las pruebas que usan Chromium lo arrancan con `startChromium()` y lo detienen al terminar (también si fallan); las demás usan un `Renderer` falso. Reloj fijo `2026-10-23T12:00:00Z` y zona `UTC` salvo que se diga otra cosa. Paneles: `P124` = `w=800,h=480,dpi=124,depth=1`; `P200` = `w=800,h=480,dpi=200,depth=1`; `V124` = `w=480,h=800,dpi=124,depth=1`. «Los ejemplos» = `config/views.example.json` + `config/data.example.json`. Carpetas temporales fuera del repo, borradas al terminar. HTTP a 127.0.0.1 solo con la función auxiliar de `docs/seguridad.md`.

- **CA1 (unidades y letra).** `mmToPx(2, 124) = 10`, `mmToPx(7, 124) = 34`, `mmToPx(0.5, 124) = 2`, `mmToPx(0.1, 124) = 1`, `mmToPx(5, 200) = 39`, `ptToPx(9, 124) = 16`, `ptToPx(12, 200) = 33`. Con `fonts = [{ family: "B", kind: "bitmap", sizes: [12, 14, 17, 20, 24] }, { family: "O", kind: "outline" }]`: `pickFont(16) = { B, 17 }`, `pickFont(25) = { B, 24 }`, `pickFont(15) = { B, 14 }`, `pickFont(13) = { B, 14 }` (empate → el más grande), `pickFont(30) = { O, 30 }`, `pickFont(10) = { O, 10 }`; con solo `[{ O, outline }]`, `pickFont(16) = { O, 16 }`.
- **CA2 (carga).** Los ejemplos cargan sin error. `parseViewsConfig` lanza `ConfigError` con ruta `/views/0/id` para un id `"h-oy"`; también lanza (con su ruta) por: un bloque `"clock"`; `devices` sin `"*"`; un aparato con una vista que no existe; columnas `[60, 50]` (no suman 100); un área que no es rectángulo (`[["a","b"],["b","a"]]`); un área sin `slots` o un `slots` sin área; `portrait` con otros nombres; un campo desconocido `"colour"`. `parseDataFile` lanza por: una vista que usa una fuente que falta; `agenda` sobre una fuente `tasks`; un título de 201 caracteres; 501 tareas; ids repetidos; `end` antes de `start`. Un archivo de vistas de 70 000 bytes → `ConfigError` con `too large` **sin parsearlo**. Ningún mensaje contiene el título de una tarea.
- **CA3 (servidor con archivos inválidos).** `npm run server -- --port 0 --views <válido>` (sin `--data`) sale con 2; con un archivo de vistas inválido sale con 2 y el mensaje nombra la ruta JSON; `--chromium http://192.0.2.1:9222` sale con 2.
- **CA4 (rectángulos).** `slotRects` de la cuadrícula de `hoy` en `P124` da, en este orden: `pendientes {0, 36, 400, 244}`, `eventos {402, 36, 398, 244}`, `jira {0, 282, 400, 198}`, `calendario {402, 282, 398, 198}`. Con `portrait` en `V124`: `pendientes {0, 36, 480, 267}` y `eventos {0, 305, 480, 189}`.
- **CA5 (contenedor).** `chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc")` contiene `-p`, `127.0.0.1:0:9222`, `--read-only`, `--cap-drop`, `ALL`, `--security-opt`, `no-new-privileges`, `--memory`, `512m`, `--pids-limit`, `256`, `--mount`, `type=bind,source=/f,target=/tintero/fonts,readonly` e `img@sha256:abc`; **no** contiene `-v`, `--privileged`, `--network`, `host` ni `0.0.0.0`.
- **CA6 (Chromium real, nitidez).** `startChromium()` devuelve `http://127.0.0.1:<puerto>`; dibujar `hoy` de los ejemplos en `P124` da `raw1` de **48 000** bytes, **`gray = 0`** y `overflow = []`; dibujarla otra vez da los mismos bytes. Después de `stop()`, `docker ps` ya no lista ese nombre.
- **CA7 (la vista de 4 bloques, P124).** `hoy` tiene 13 zonas en este orden: 5 `toggle` de `pendientes` (`{10, 92, 380, 24}`, `y` 116, 140, 164 y `{10, 210, 380, 24}`; `t-001`…`t-005`), 5 `open` de `eventos` (`{412, 92, 378, 24}`, `y` 116, 140, 186, 232; `e-002`, `e-003`, `e-004`, `e-005`, `e-007`) y 3 `open` de `jira` (`{10, 316, 380, 44}`, `y` 360, 404); ninguna de `calendario`. `hidden = { pendientes: 5, eventos: 0, jira: 2, calendario: 0 }`, `overflow = []`, `tooSmall = []`. Los ids son `zoneId("hoy", "tareas", "t-001")`, etc. El cuerpo de zonas pasa `validateZones` y **no** contiene `t-001`, `PROJ-142` ni ningún título.
- **CA8 (divisores y calendario, P124).** En la imagen de `hoy`: negro en `(400, 150)`, `(401, 150)`, `(200, 280)` y `(200, 281)`; blanco en `(399, 150)`, `(402, 150)`, `(200, 279)` y `(200, 282)`. En `calendario` hay al menos un rectángulo negro relleno (hoy invertido) de 12 px o más de alto.
- **CA9 (lista completa y casillas, P124).** `pendientes` tiene 10 zonas (`hidden = { lista: 0 }`): la primera `{10, 68, 780, 24}`, la quinta (`t-005`) en `y = 186`. Casilla de `t-001` (pendiente) en `x = 10, y = 72`, de 15 × 15: negro en `(10, 79)` y `(11, 79)`, blanco en el centro `(17, 79)`; `t-002` (hecha): negro en `(17, 103)`.
- **CA10 (otros ppp y panel vertical).** `pendientes` en `P200`: primera zona `{16, 110, 768, 39}`. `hoy` en `V124` (usa `portrait`): primera zona de `pendientes` `{10, 92, 460, 24}`, primera de `eventos` `{10, 361, 460, 24}`, `raw1` de 48 000 bytes, `overflow = []` y `tooSmall = []`.
- **CA11 (desbordes y espacio insuficiente).** Con el Chromium real: `render` de un HTML a mano con `<div data-fit="x" style="width:50px;height:20px;overflow:hidden;white-space:nowrap">texto que no cabe en cincuenta píxeles</div>` devuelve `overflow = ["x"]`. Una vista con `grid.columns = [10, 90]` y `task-list` en la columna de 80 px → `tooSmall = [<esa área>]`, `overflow = []`, y esa área no tiene zonas. Todas las vistas de los ejemplos en `P124`, `P200` y `V124` dan `overflow = []`.
- **CA12 (agenda).** `agenda` en `P124`: 5 zonas `open` en `y = 68, 92, 116, 162, 208` (`e-002`, `e-003`, `e-004`, `e-005`, `e-007`); `e-001` y `e-006` sin zona. Con `timezone: "America/Lima"` y reloj `2026-10-24T03:00:00Z` (22:00 del 23 en Lima), un evento `2026-10-24T02:00:00Z` sale bajo el día 23.
- **CA13 (abrir un detalle).** `apply` de `open` sobre la zona de `e-003` en `agenda` (aparato `local`) → `applied`, `changed: true`. El siguiente `index` trae `agenda-d` con `parent: "agenda"` y `current = "agenda-d"`, con zonas `[]`; el `index` que sigue trae `current = "hoy"` y `agenda-d` sigue en la lista. Igual con `open` sobre la zona de `j-142` en `hoy` → `hoy-d`.
- **CA14 (marcar).** Con el motor ya dibujado para `local` en `P124`: `toggle` sobre la zona de `t-001` en `pendientes` → `applied`, `changed: true`; tras `idle()`, `renders()` aumentó en **2** (`hoy` y `pendientes`; `agenda` no), la huella de `agenda` no cambió, y el centro de la casilla de `t-001` en `pendientes`, `(17, 79)`, es negro. La misma acción (mismo `id`) → `duplicate`. `toggle` sobre una zona de `jira` (fuente `readonly`) → `stale`; `toggle` sobre una zona de `agenda` → `stale`; `open` sobre una zona de `pendientes` → `stale`; zona `zffffffffff` → `stale`.
- **CA15 (caché compartida).** Con `devices` = `{ "*": [hoy, pendientes, agenda], "p2": [agenda] }`: `index("p1", P124)` → `renders() = 3`; `index("p2", P124)` trae solo `agenda` y `renders()` sigue en 3; `view("p2", P124, "pendientes", <huella>)` → `unknown_view`; `index("p1", P200)` → `renders() = 6`.
- **CA16 (cambio de día).** Después de un `index` con reloj `2026-10-23T12:00:00Z`, otro con `2026-10-24T00:00:01Z` redibuja las 3 vistas, y en `agenda` ya no están las zonas de `e-002`, `e-003` ni `e-004`.
- **CA17 (espera y `busy`).** Con un `Renderer` falso que tarda 3000 ms, el primer `index` responde `busy` (`retryAfterS: 5`) en menos de 2,5 s; tras `idle()`, responde bien sin volver a dibujar. Por HTTP (`createApp` con ese motor): **503**, `Retry-After: 5`, `ErrorBody` válido `busy`.
- **CA18 (huellas y errores por HTTP).** Con `createApp({ …, engine })` y los ejemplos: `GET /api/v1/index` pasa `validateIndex` con `views` = `hoy`, `pendientes`, `agenda` y `current = "hoy"`; imagen y zonas de cada vista responden con su huella; `h` vieja → **409** `stale_view`; vista `nada` → **404** `unknown_view`.
- **CA19 (texto peligroso).** Una tarea con título `<img src="http://example.invalid/x"><script>document.title=1</script></style><style>*{display:none}</style>` se dibuja como texto: su zona existe, `gray = 0`, `overflow = []` y `blockedRequests()` **no** aumenta. `render` de un HTML a mano con `<img src="http://example.invalid/x">` termina bien y **sí** aumenta `blockedRequests()`.
- **CA20 (ciclo con el emulador).** `npm run server -- --port 0 --views config/views.example.json --data config/data.example.json` arranca su propio Chromium; `runWake` (`power: "usb"`, panel `P124`) baja las 3 vistas y `screen.raw1` es byte a byte la imagen de `hoy`; `press(tab)` (foco en la primera zona) y `press(ok)` marcan `t-001`, y tras la siguiente despertada el píxel `(17, 103)` de `hoy` (centro de la casilla de `t-001`: fila en `y = 92`, casilla de 15 px en `y = 96`) es negro. Con SIGTERM al servidor, en menos de 15 s no queda ningún contenedor `tintero-chromium-*` suyo.
- **CA21 (vista previa).** `npm run render -- --views config/views.example.json --data config/data.example.json --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-23T12:00:00Z --out <tmp>` sale con 0 y escribe `hoy.png`, `pendientes.png`, `agenda.png` (cada uno pasa `checkImage("png1", …)`), los tres `*.zones.png` y los tres `*.zones.json` (cada uno pasa `validateZones`; el de `hoy` tiene 13 zonas).
- **CA22 (registro).** Durante CA20, el registro tiene una línea `{ "ts", "render", "ms", "ok" }` por dibujo y no contiene ningún título, categoría ni `key` de los datos.
- **CA23 (un servicio avisa).** Con el motor ya dibujado para `local` en `P124`: `setSource("tareas", <las 10 tareas con t-005 cambiada a done: true>)` → `{ ok: true, changed: true }`; tras `idle()`, `renders()` aumentó en 2 y en `hoy` el centro de la casilla de `t-005` (fila en `y = 210`, casilla en `y = 214`), `(17, 221)`, es negro. Repetir el mismo `setSource` → `changed: false` y `renders()` no cambia. `setSource("nada", [])` y `setSource("tareas", [{ "id": "x" }])` → `{ ok: false }`, sin títulos en el motivo.
- **CA24 (preparado antes de despertar).** Con `nextWakeS = 1800` y reloj `2026-10-23T23:30:30Z`: `index("local", P124)` (3 dibujos; la próxima despertada es a las `00:00:30` del 24). Reloj a `23:59:00` (faltan 90 s) → `prewarm()` no encola nada. Reloj a `23:59:40` (faltan 50 s, **todavía es el 23**) → `prewarm()` y `idle()`: `renders()` = 6 (las 3 vistas con la fecha del 24). Reloj a `2026-10-24T00:00:30Z` → `index("local", P124)` responde **sin dibujar** (`renders()` sigue en 6) y `agenda` ya no tiene las zonas de `e-002`, `e-003` ni `e-004`.
- **CA25 (sin motor, igual que antes).** `npm run test:acceptance -- tests/acceptance/F-003 tests/acceptance/F-004` pasa.

## Presupuestos
- Una vista de 800 × 480 con el contenedor arrancado: **< 500 ms** (medido: 180–370 ms).
- `startChromium()` con la imagen descargada: **< 30 s** (medido: ~2 s).
- `index` con todo dibujado, y una imagen en caché: **< 50 ms** cada uno. `POST /api/v1/actions`: **< 50 ms** (el dibujo va en segundo plano).
- Memoria del contenedor: tope de **512 MB**.

## Seguridad
- [x] Toda entrada externa con **límite de tamaño antes de parsear**: vistas ≤ 64 KiB, datos ≤ 512 KiB, PNG de Chromium (medidas antes de descomprimir y `maxOutputLength`), textos con los largos del *Contrato*.
- [x] Servicios locales solo en **127.0.0.1**: CDP solo en `127.0.0.1`; `--chromium` solo acepta `http://127.0.0.1:<puerto>`.
- [x] Dependencias nuevas nombradas arriba: `playwright-core` (zona sensible); la imagen de Chromium, fijada por *digest*; las letras con su licencia.
- **Lo que se dibuja no puede salir a la red:** todo texto de los datos pasa por el escape de HTML (`& < > " '`); el HTML se arma solo con una función de plantilla que escapa cada valor; CSP `default-src 'none'; style-src 'unsafe-inline'`; JavaScript apagado; toda petición bloqueada; ningún CSS usa `url()` ni `@font-face` (las letras salen de fontconfig). CA19.
- **Contenedor endurecido** (CA5): solo lectura, sin capacidades, `no-new-privileges`, topes de memoria y procesos, letras de solo lectura, sin red del host.
- **Excepción documentada:** CDP al Chromium local por `http://127.0.0.1` sin TLS (no sale de la máquina). El arquitecto la agrega a `docs/seguridad.md` antes de programar, con la forma de la excepción de las pruebas (una sola función con el único acceso marcado).
- S1: el aparato solo recibe imágenes y zonas con ids opacos (CA7). S6: registro y errores sin contenido (CA2, CA22).
- `server/src/engine/chromium.ts` y `server/src/engine/html.ts` pasan a **zona sensible** (`tools/sensitive-paths.txt`, lo hace el arquitecto).

## Archivos
- **Los prepara el arquitecto antes de programar** (después de la puerta 1): `server/fonts/` (la letra que escoja el dueño en D5, normal y negrita; `DejaVuSans.ttf` y `DejaVuSans-Bold.ttf`; sus licencias; `fonts.conf` sin suavizado y con `embeddedbitmap`; `README.md` con el origen y la suma SHA-256 de cada archivo; si se escoge una letra X11, el script del arquitecto que le agrega la tabla `glyf` vacía, en `tools/`); `CHROMIUM_IMAGE` en `tools/images.conf`; `tools/sensitive-paths.txt`; la excepción de CDP en `docs/seguridad.md`; los ADR de las decisiones. Ya están, con esta ficha: `config/views.example.json` y `config/data.example.json`.
- A crear: `server/src/engine/` (`index.ts`, `units.ts`, `theme.ts`, `config.ts`, `layout.ts`, `html.ts`, `blocks/*.ts`, `dates.ts`, `png.ts`, `chromium.ts`, `engine.ts`, y sus `*.test.ts`; se puede repartir distinto mientras `index.ts` exporte lo del *Contrato*); `server/scripts/render.ts` y su prueba.
- A tocar: `server/src/app.ts`, `server/src/args.ts`, `server/src/main.ts`, `server/src/index.ts` (exporta el motor), `server/README.md`, `package.json` (`playwright-core` y el script `render`), `package-lock.json`, `knip.json` (entradas `server/src/engine/index.ts` y `server/scripts/*.ts`).

## Resultado esperado
`npm run server -- --views config/views.example.json --data config/data.example.json` + el emulador muestran la vista de 4 bloques del dueño (pendientes con «+5 más», próximos eventos, Jira con «+2 más» y el calendario del mes), la lista completa de pendientes y la agenda; con `Tab` y Aceptar se marca una tarea y la pantalla cambia; Aceptar sobre un evento o una tarea de Jira abre su detalle. `npm run render` deja las mismas imágenes en PNG para revisarlas con las zonas encima. Las integraciones solo tienen que entregar tareas y eventos en los tipos comunes.

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
