# server

Servidor mínimo de Tintero (F-003): habla el contrato v1 con vistas de demostración (`demo`, `detalle`, `patron`) dibujadas por código en `raw1`, para cualquier panel declarado. Solo escucha en `127.0.0.1`, sin TLS (demostración local) o con TLS y certificado de cliente (F-004); el estado vive en memoria.

## Arrancar

```bash
npm run server -- [--port 8790] [--host 127.0.0.1] [--next-wake-s 1800] [--headers-timeout-ms 10000]
```

La primera línea de la salida es `{"listening":"http://127.0.0.1:<puerto>"}` (`--port 0` elige un puerto libre). `--host` distinto de `127.0.0.1` sale con código 2. Cada petición escribe una línea JSON en la salida estándar, sin contenido (S6).

## Con el motor de vistas (F-005)

```bash
npm run server -- --views config/views.example.json --data config/data.example.json [--chromium http://127.0.0.1:<puerto>]
```

- `GET /api/v1/index` lee `Tintero-View` (la vista que muestra el aparato) y pone `full_refresh`; `GET /api/v1/views/{id}/zones` agrega `focus` (ver *Foco, banda y alineación*). Sin motor (demostración de F-003), `full_refresh` es siempre `false`.
- `--views` (≤ 64 KiB) y `--data` (≤ 512 KiB) van **juntos** (si falta uno, sale con 2); un error en los archivos sale con 2 y un mensaje con la ruta JSON del campo (nunca el valor). Sin ellos, el servidor sigue con la demostración de F-003.
- Sin `--chromium`, el servidor arranca su propio contenedor (`startChromiumService()`: imagen `CHROMIUM_IMAGE` de `tools/images.conf`, letras de `server/fonts/`, solo escucha en `127.0.0.1`) y lo detiene al salir (Ctrl+C / SIGTERM). Necesita Docker. `--chromium` solo acepta `http://127.0.0.1:<puerto>` (excepción de CDP en `docs/seguridad.md`).
- Cada dibujo escribe una línea `{ "ts", "render", "ms", "ok" }` (más `overflow` o `tooSmall` si los hay), sin contenido.
- Los dibujos se hacen cuando hay información nueva (`setSource`, una acción) o antes de que la pantalla despierte (cada 30 s se llama a `prewarm`); `503 busy` + `Retry-After: 5` solo es la red de seguridad.

### Vista previa

```bash
npm run render -- --views config/views.example.json --data config/data.example.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-23T12:00:00Z --out /tmp/tintero-vistas
```

Por cada vista del aparato (`--device`, por defecto `*`) escribe `<id>.png` (la misma imagen que recibe el aparato), `<id>.zones.png` (con el borde de cada zona invertido, 2 px) y `<id>.zones.json`. Sale con 0; con 2 ante opciones o archivos inválidos; con **1** si alguna vista tiene desbordes. La carpeta de salida debe quedar fuera del repo.

### Bloque `task-board` (F-006)

Tareas del tablero por etapa (`doing` *En progreso*, `todo` *Por hacer*, `done` *Hecho hoy*). Ejemplos: `config/tablero.views.example.json` y `config/tablero.data.example.json`.

```bash
npm run render -- --views config/tablero.views.example.json --data config/tablero.data.example.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-24T17:00:00Z --out /tmp/tintero-tablero
```

| Opción | Valores | Por defecto |
|--------|---------|-------------|
| `stages` | 1–3 de `"doing"`, `"todo"`, `"done"`, sin repetir, en el orden en que se dibujan | `["doing", "todo"]` |
| `lead` | `true`: la primera etapa **manda** (franja negra, títulos de hasta 2 líneas, casilla grande) | `false` |
| `group_by` | `"category"` \| `"none"` (etapas que no mandan; sin encabezados si ninguna tarea trae categoría) | `"category"` |
| `density` | `"row"` (una línea) \| `"card"` (título de hasta 2 líneas y detalle) — etapas que no mandan | `"row"` |

- Cada etapa tiene una franja con su nombre y su total (o, si manda y la fuente lleva más de 5 min sin lectura buena, `sin datos desde HH:MM`). En *Hecho hoy* solo entran las de `doneAt` del día local de la vista.
- Casilla: *Por hacer* vacía, *En progreso* a medias, *Hecho* llena y con el título tachado; sin casilla si la fuente es `readonly`. `vence` anterior a hoy sale blanco sobre negro.
- **Regla de «cabe»:** si todo cabe, se dibuja todo. Si no, se reserva `moreRow` al final y se recorre etapa por etapa: cada una conserva su franja y su primera fila (se reserva lo que necesitan las etapas que faltan) y sus filas entran mientras quepan; la primera que no cabe pasa a la etapa siguiente. «+N más» cuenta las tareas sin mostrar de todas las etapas. Mínimo: 30 mm de ancho y alto para franja + primera fila + «+N más»; si no, «No cabe».
- Zonas: una por tarea (`toggle`, o `open` si la fuente es `readonly`). `toggle` pasa la tarea a *Hecho* (con `doneAt` = reloj del motor) y, otra vez, la devuelve a su etapa anterior.
- `setSource(id, items, { readAt })` recibe la hora de la última lectura buena.

### Foco, banda y alineación (F-008, ADR-0048 a ADR-0050)

Medidas del tema `base` (en `Metrics`; a 124 ppp / a 200 ppp): `focusRing` 0,6 mm (3 / 5 px), `focusDash` 8 px fijos (un byte), `focusPad` 1,2 mm (6 / 9 px), `focusGap` 0,6 mm (3 / 5 px), `row` 6,2 mm (30 / 49 px), `line` `max(2, 0,5 mm)` (2 / 4 px).

- **Columna de foco.** Con `X`, `W` el rectángulo del área y `M` el margen: `Z0 = ceil8(X + M − focusPad)` y `Z1 = floor8(X + W − M + focusPad)`; el bloque recibe `w = Z1 − Z0` y se coloca en `Z0`. Toda zona ocupa el ancho entero de la columna, así `x` y `w` salen múltiplos de 8 (si no, el motor deja la zona fuera y registra `{ event: "zone-unaligned", view }`).
- **La banda.** Por dentro de cada zona, `focusPad` px **en blanco** por los cuatro lados: casilla, texto y etiqueta empiezan a `focusPad` del borde. Lo que no es zona (franjas, encabezados, «+N más», filas de vacío, `month-calendar`, detalle) pone su texto desde `Z0 + focusPad`; los fondos negros y las rayas de las franjas van de `Z0` a `Z1 − 1`. Después de cada dibujo el motor llama a `checkFocusBand`: si una zona trae tinta en la banda, `RenderedView.bandInk` la lista y se registra `{ event: "focus-band-ink", view, count }` (sin textos).
- **Altos.** Fila `row`: `row` (sin hueco entre filas). Fila que manda: `2·leadLine + metaLine + 2·focusPad` (86 px); `card`: `2·cardLine + metaLine + 2·focusPad` (72 px); filas de `issue-list`: `issueRow + 2·focusPad` y `issueDescRow + 2·focusPad`. Antes de cada fila que manda y de cada `card`: `focusGap`. La etiqueta de vencida mide `row − 2·focusPad − 4` y el tachado de las hechas, `line`.
- **`full_refresh`.** El motor lo pone en `true` en el primer `index` de cada día local (zona horaria de la configuración) por aparato; tras reiniciar, el primer `index` da `true`.
- **`Tintero-View`.** `index(device, panel, { view })` devuelve esa vista como `current` si está entre las del aparato (si no, la primera; el detalle recién abierto manda) y la dibuja antes que las demás.

### Bloque `agenda`: pictogramas y festivos (F-014, ADR-0053)

Si al menos una fila dibujada tiene `icon`, el bloque gana una primera columna de `texto + 6` px con un `<svg>` de `texto` × `texto` px (`viewBox 0 0 16 16`, `crispEdges`) en `y = fila + focusPad + floor((ih − texto) / 2)`; si ninguna lo tiene, se dibuja como antes. Los seis dibujos viven en `server/src/engine/blocks/pictograms.ts`. Con `options.holidays: true`, cada festivo del rango es la primera fila de su día, con la `estrella`; no es zona y cuenta para «+N más».

### Bloque `calibration` (F-008)

Una hoja de prueba fija para decidir en el panel real, con el refresco rápido, los trazos y la letra de los detalles. No lleva `source` (si se pone, `ConfigError`), no tiene zonas, y el archivo de datos puede traer `"sources": {}`. Ejemplos: `config/calibracion.views.example.json` y `config/calibracion.data.example.json`.

```bash
npm run render -- --views config/calibracion.views.example.json --data config/calibracion.data.example.json \
  --panel w=800,h=480,dpi=124,depth=1 --out /tmp/tintero-calibracion
```

Dibuja, desde la esquina del contenido: rayas de 1, 2 y 3 px (horizontales y verticales, en píxeles a propósito), siete líneas con `Ñandú pingüino ÁÉÍÓÚ 0123 22 oct` (Terminus 14 y 16 normal y negrita, DejaVu Sans 9 pt, 12 pt y 9 pt tachado), las tres casillas, la etiqueta `22 oct` y un anillo punteado y uno sólido de muestra (`Foco`, `Enviando`). Está pensada para el panel de 800 × 480 a 124 ppp (mide unos 75 mm de alto).

### Cómo se escribe un bloque nuevo

Un bloque es una función `(context: BlockContext) => BlockResult` en `src/engine/blocks/<nombre>.ts`, registrada en `blocks/index.ts` y en `config.ts` (nombre, tipo de fuente y opciones). No sabe de dónde vienen los datos (ADR-0009): recibe los elementos de su fuente.

1. **Su diseño.** Todo en unidades físicas del tema (`context.metrics`: márgenes, alto de fila, letras ya elegidas con `pickFont`; nunca píxeles fijos). El bloque es dueño de su diseño, incluido qué hace con el texto que no cabe (una línea con «…», varias líneas con tope…). El HTML se arma **solo** con la plantilla `html` de `html.ts` (escapa todo valor); nada de `url()`, `@font-face` ni scripts.
2. **Su regla de «cabe».** Use `fitList` de `blocks/common.ts`: las filas tienen el alto de su diseño, un encabezado solo se pone si cabe con una fila suya y, si no cabe todo, se reserva al final la fila «+N más» (`moreRow`). Devuelva `hidden` = cuántos elementos no se mostraron. Si el espacio es más chico que el mínimo del bloque, devuelva `noFit(context)` (`tooSmall`).
3. **Sus zonas.** Por cada fila con foco llame `context.focus(itemId, "toggle" | "open", w, h)` **en el orden de las filas** (es el orden de `Tab`) y ponga el id que devuelve en `data-zone`. El motor ya limita a 48 zonas y a ≥ 8 px, y mide la caja real del elemento. La zona ocupa el ancho entero de la columna (`context.w`) y todo lo visible de la fila va a `focusPad` de sus cuatro bordes (ver *Foco, banda y alineación*). Si el bloque no tiene foco, no llame a `focus`.
4. **Revisión de desbordes.** Marque el contenedor y cada fila con `data-fit="<área>"` (`context.area`); el motor revisa después de dibujar que nada se salga a lo alto ni a lo ancho. Los textos con «…» no cuentan: se cortan a propósito dentro de su fila.
5. Pruebas junto al código con el `Renderer` falso de `testing.ts`; `npm run render` muestra el resultado real.

## Tareas desde Trilium (F-009, `--integrations`)

Con `--integrations <archivo>` (y `--views`, `--data`) el servidor lee el tablero Kanban de Trilium cada 60 s y escribe ahí la marca *Hecho*. Un archivo de ejemplo con valores de relleno: `config/integrations.example.json`; el real va **fuera del repo**.

1. **Crear el token propio de Tintero.** En Trilium: *Opciones → ETAPI → Crear token*, con el nombre `tintero`. Un token ETAPI puede todo (no tiene alcances): no lo compartas con otra cosa.
2. **Guardar la llave.** Un archivo **fuera del repo**, con permisos 600 (`chmod 600 <archivo>`), con solo el token en una línea (máximo 4 KiB). Su ruta absoluta va en `keyFile`.
3. **Configurar.** `baseUrl` es `http://127.0.0.1:<puerto>/etapi` (Trilium en la misma máquina) o una dirección `https://`; `boardNoteId` es el id de la nota del tablero. `allowWrite: true` exige que la fuente del archivo de datos tenga `readonly: false` (y `false` exige `readonly: true`); si no coinciden, el servidor no arranca.
4. **Revocar.** En Trilium: *Opciones → ETAPI*, borrar el token `tintero`. Para cortar la escritura sin revocar, pon `allowWrite: false` (y `readonly: true`) y reinicia.

5. **Archivo de estado (opcional, `stateFile`).** Ruta absoluta de un archivo **fuera del repo**, en una carpeta que exista y se pueda escribir (si no, el servidor sale con 2 y `/integrations/trilium-tareas/stateFile`). Guarda, con permisos 600 y escritura atómica, la última lectura buena y las marcas aún no escritas en Trilium, para que un apagado no las pierda: al volver, la pantalla muestra lo último («sin datos desde 23/10 18:30» si Trilium no responde) y las marcas se escriben cuando Trilium vuelva (las 24 h siguen contando). **Tiene títulos de tareas**, así que trátalo como privado. Se puede borrar sin perder nada de Trilium: solo se pierden las marcas que aún no se habían escrito. Si está dañado, con permisos abiertos o es de otro tablero, se ignora, se registra y el servidor arranca limpio.

Si el archivo de la llave tiene permisos para otros usuarios, falta, está vacío o pesa más de 4 KiB, el servidor sale con 2 y dice el motivo (`key-permissions`, `key-missing`, `key-empty`, `key-too-large`), nunca el token.

## Probarlo con el emulador

```bash
npm run server -- --port 8790
# en otra terminal (la carpeta de --store debe estar fuera del repo):
npm run emulator -- --server http://127.0.0.1:8790 --store /tmp/tintero-emu --wakes 1 --keys tab,ok
```

`screen.png` en la carpeta del emulador muestra la demostración; con `--keys tab,ok` se marca una casilla. La vista `patron` trae una cuadrícula de 1 cm para comprobar el tamaño con una regla.

## Exponerlo con certificado por pantalla (F-004, L1)

Con las cuatro opciones TLS el servidor escucha **HTTPS** en `127.0.0.1` y exige el certificado de cliente de una pantalla de la lista. Funnel (`tailscale funnel --tcp`) solo reenvía bytes a ese puerto; el servidor es quien ve el certificado.

```bash
# 1. Autoridad privada y certificados, SIEMPRE en una carpeta fuera del repo (700; llaves 600):
npm run pki -- init /ruta/privada/pki
npm run pki -- server /ruta/privada/pki tintero.ejemplo.ts.net
npm run pki -- device /ruta/privada/pki p1      # imprime «<huella> p1»

# 2. Lista de aparatos (fuera del repo): una línea «<huella> <id>» por pantalla; # = comentario
echo "<la línea impresa>" >> /ruta/privada/devices.txt

# 3. Arrancar
npm run server -- --port 8443 \
  --tls-cert /ruta/privada/pki/server.crt --tls-key /ruta/privada/pki/server.key \
  --client-ca /ruta/privada/pki/ca.crt --devices /ruta/privada/devices.txt
```

- El conteo de paneles por aparato empieza al arrancar el servidor y no se poda; está acotado por aparatos listados × `--max-panels`.
- Las cuatro opciones TLS van juntas; si falta una o un archivo no se lee, sale con 2 sin escuchar. `--max-panels N` (2) limita los paneles distintos por aparato; `--max-connections N` (32).
- Revocar una pantalla = quitar su línea de la lista; se relee sola (sin reiniciar). Si la lista es ilegible, pasa de 64 KiB o tiene una línea inválida, nadie está listado y se registra `devices_error`. Un certificado válido pero no listado recibe 404 vacío.
- `pki` usa la CLI `openssl` (sin _shell_), ECDSA P-256, y se niega a escribir dentro del repo o sobre archivos existentes. Vigencias: CA 10 años, pantalla 5, servidor 2.
- El emulador: `npm run emulator -- --server https://tintero.ejemplo.ts.net:8443 --ca ca.crt --cert devices/p1.crt --key devices/p1.key`.

## Publicarlo para las pantallas: nodo de Tailscale propio (F-012, ADR-0047)

El ESP32 no corre Tailscale, y un Funnel en el servidor publicaría su nombre en DNS público. Por eso Tintero se publica desde **otro aparato del tailnet**, `tintero`: un contenedor `tailscale/tailscale` (plantillas en `deploy/funnel/`) que abre Funnel **solo en su 443** y lo reenvía tal cual a Tintero en `127.0.0.1:<puerto TLS>`. Tintero sigue terminando el TLS y pidiendo el certificado de cada pantalla.

1. En la consola de Tailscale: `tag:tintero` en `tagOwners` y el atributo `funnel` para `tag:tintero` en `nodeAttrs`; una llave de acceso no reutilizable, no efímera, preaprobada, con `tag:tintero`, de 1 día. Si la política tiene reglas de acceso propias, `tag:tintero` **no** necesita salir hacia ningún otro aparato del tailnet (es la parte expuesta a internet): no le des reglas de salida.
2. Guardar la llave como una línea `TS_AUTHKEY=<llave>` en el archivo que diga `TINTERO_AUTHKEY_FILE` (600).
3. `tools/instalar-funnel` prepara la carpeta del nodo (`TINTERO_FUNNEL_DIR`); no arranca nada.
4. **Abrirlo** (lo hace el dueño): `cd <carpeta del nodo> && docker compose up -d`. **Cerrarlo:** `docker compose down`. Con `restart: unless-stopped`, una vez abierto vuelve solo tras reiniciar la máquina (es un servicio permanente); `down` lo deja cerrado también después de reiniciar. El contenedor tiene topes de procesos (128), memoria (256 MB) y registros (3 × 5 MB).
5. Comprobar en los servidores DNS autoritativos que el nombre `tintero` resuelve y el del servidor **no** (NXDOMAIN).

La URL de las pantallas es `https://tintero.<tailnet>.ts.net` (443). Qué necesita el ESP32: `firmware/README.md`.

## Como servicio (F-010)

Tintero corre como servicio de **systemd de usuario** (sin `sudo`): arranca con la máquina (el usuario tiene *linger*) y se levanta solo 5 s después de caerse. Si Docker aún no responde, el servidor sale con 2 y systemd reintenta.

```bash
# 1. Claves TINTERO_DIR, TINTERO_NODE y TINTERO_ARGS en la configuración local (docs/configuracion-local.md)
tools/instalar-servicio --dry-run   # muestra la unidad sin escribir nada
tools/instalar-servicio             # la deja en la carpeta de unidades de usuario y la habilita (no la arranca)

# 2. Arrancar
systemctl --user start tintero

# 3. Registros
journalctl --user -u tintero -f

# 4. Actualizar
git pull && npm ci && systemctl --user restart tintero
```

- El servicio usa `--instance servicio` (en `TINTERO_ARGS`; 1 a 32 caracteres `a-z`, `0-9`, `-`; si no casa, sale con 2). Con `--instance`, al arrancar su Chromium el servidor borra solo los contenedores con las etiquetas `tintero.chromium=1` **y** `tintero.instance=<nombre>` que haya dejado un choque (registra `{ event: "chromium", action: "orphans", count }`). Sin `--instance`, o con `--chromium` (uno externo), no borra nada.
- **Una instancia por nombre:** dos procesos con la **misma** `--instance` se borrarían el Chromium entre sí al arrancar (cada uno borra los contenedores de esa instancia). Cada proceso que corra a la vez usa su propio nombre.
- **Si `docker ps` falla durante la limpieza** de huérfanos, el arranque se aborta; con el servicio, systemd lo reintenta (F-010).
- **Recuperación sin reiniciar el proceso (F-011):** sin `--chromium`, si Docker no responde al arrancar el servidor **espera y reintenta** (1, 2, 4… hasta 60 s entre intentos, sin fin; registra `{ event: "docker", ok: false }` y luego una por hora, y `ok: true` con `waitedS` al volver) y **empieza a escuchar cuando Chromium está listo**. Si su Chromium muere, lo relanza (`{ event: "chromium", action: "restart" }`); mientras tanto las vistas contestan `503 busy`. El contenedor se arranca con `--pull never`: la imagen de `tools/images.conf` tiene que estar en la máquina; si no, registra `{ event: "chromium", action: "start", ok: false, code: "image-missing" }` (una vez por hora) y sigue esperando. Un error sin atrapar (`uncaughtException` / `unhandledRejection`) registra `{ event: "fatal", kind }` (sin mensaje ni pila), hace el apagado ordenado (tope de 30 s) y sale con **1**: systemd lo levanta a los 5 s. `tools/prueba-recuperacion` comprueba en vivo `kill -9`, la muerte de Chromium y (con `--trilium`) la caída de Trilium.

### Lista de chequeo del apagón real (la corre el dueño)

Con el servicio instalado y arrancado, reinicia la máquina (corta la sesión de Claude) y, al volver:

1. [ ] `systemctl --user is-active tintero` da `active`.
2. [ ] `docker ps --filter label=tintero.chromium=1 --filter label=tintero.instance=servicio -q | wc -l` da `1` (un solo Chromium).
3. [ ] El emulador, apuntando al servicio, recibe una vista (`GET /api/v1/index` da 200 y la vista se dibuja).
4. [ ] La vista de tareas muestra primero lo guardado (el último estado de F-009) y, pasados unos minutos, lo de Trilium.
5. [ ] `journalctl --user -u tintero` muestra, como mucho, una línea `docker ok: false` por hora mientras Docker tardó, y ningún arranque fallido repetido cada 5 s.

## Código (`src/`)

- `index.ts`: `createApp`, `startServer`, `demoViews`, `fingerprint` (interfaz para pruebas). `main.ts` y `args.ts`: arranque.
- `app.ts`: rutas, límites, errores, caché (expulsa la menos usada), paneles por aparato y registro de peticiones. `log.ts`: registro.
- `tls.ts`: opciones TLS y huella. `devices.ts`: lista de aparatos. `../scripts/pki.ts`: CA y certificados.
- `views.ts`, `draw.ts`, `state.ts`: vistas de demostración, dibujo `raw1` y estado.
- `engine/` (F-005): `config.ts` (archivos de vistas y datos), `units.ts` y `theme.ts` (mm/pt → px, letras), `layout.ts` (cuadrícula → rectángulos), `blocks/` (un archivo por bloque), `view.ts` y `html.ts` (HTML de una vista, zona sensible), `chromium.ts` (contenedor y CDP, zona sensible), `png.ts` (PNG de Chromium → `raw1`), `engine.ts` (caché, cola de dibujo, estado por aparato, acciones), `index.ts` (lo que se exporta). `../scripts/render.ts`: vista previa.
- `integrations/` (F-009): ver su `README.md`.
