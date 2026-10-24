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

- `--views` (≤ 64 KiB) y `--data` (≤ 512 KiB) van **juntos** (si falta uno, sale con 2); un error en los archivos sale con 2 y un mensaje con la ruta JSON del campo (nunca el valor). Sin ellos, el servidor sigue con la demostración de F-003.
- Sin `--chromium`, el servidor arranca su propio contenedor (`startChromium()`: imagen `CHROMIUM_IMAGE` de `tools/images.conf`, letras de `server/fonts/`, solo escucha en `127.0.0.1`) y lo detiene al salir (Ctrl+C / SIGTERM). Necesita Docker. `--chromium` solo acepta `http://127.0.0.1:<puerto>` (excepción de CDP en `docs/seguridad.md`).
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

### Cómo se escribe un bloque nuevo

Un bloque es una función `(context: BlockContext) => BlockResult` en `src/engine/blocks/<nombre>.ts`, registrada en `blocks/index.ts` y en `config.ts` (nombre, tipo de fuente y opciones). No sabe de dónde vienen los datos (ADR-0009): recibe los elementos de su fuente.

1. **Su diseño.** Todo en unidades físicas del tema (`context.metrics`: márgenes, alto de fila, letras ya elegidas con `pickFont`; nunca píxeles fijos). El bloque es dueño de su diseño, incluido qué hace con el texto que no cabe (una línea con «…», varias líneas con tope…). El HTML se arma **solo** con la plantilla `html` de `html.ts` (escapa todo valor); nada de `url()`, `@font-face` ni scripts.
2. **Su regla de «cabe».** Use `fitList` de `blocks/common.ts`: las filas tienen el alto de su diseño, un encabezado solo se pone si cabe con una fila suya y, si no cabe todo, se reserva al final la fila «+N más» (`moreRow`). Devuelva `hidden` = cuántos elementos no se mostraron. Si el espacio es más chico que el mínimo del bloque, devuelva `noFit(context)` (`tooSmall`).
3. **Sus zonas.** Por cada fila con foco llame `context.focus(itemId, "toggle" | "open", w, h)` **en el orden de las filas** (es el orden de `Tab`) y ponga el id que devuelve en `data-zone`. El motor ya limita a 48 zonas y a ≥ 8 px, y mide la caja real del elemento. Si el bloque no tiene foco, no llame a `focus`.
4. **Revisión de desbordes.** Marque el contenedor y cada fila con `data-fit="<área>"` (`context.area`); el motor revisa después de dibujar que nada se salga a lo alto ni a lo ancho. Los textos con «…» no cuentan: se cortan a propósito dentro de su fila.
5. Pruebas junto al código con el `Renderer` falso de `testing.ts`; `npm run render` muestra el resultado real.

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

## Código (`src/`)

- `index.ts`: `createApp`, `startServer`, `demoViews`, `fingerprint` (interfaz para pruebas). `main.ts` y `args.ts`: arranque.
- `app.ts`: rutas, límites, errores, caché (expulsa la menos usada), paneles por aparato y registro de peticiones. `log.ts`: registro.
- `tls.ts`: opciones TLS y huella. `devices.ts`: lista de aparatos. `../scripts/pki.ts`: CA y certificados.
- `views.ts`, `draw.ts`, `state.ts`: vistas de demostración, dibujo `raw1` y estado.
- `engine/` (F-005): `config.ts` (archivos de vistas y datos), `units.ts` y `theme.ts` (mm/pt → px, letras), `layout.ts` (cuadrícula → rectángulos), `blocks/` (un archivo por bloque), `view.ts` y `html.ts` (HTML de una vista, zona sensible), `chromium.ts` (contenedor y CDP, zona sensible), `png.ts` (PNG de Chromium → `raw1`), `engine.ts` (caché, cola de dibujo, estado por aparato, acciones), `index.ts` (lo que se exporta). `../scripts/render.ts`: vista previa.
