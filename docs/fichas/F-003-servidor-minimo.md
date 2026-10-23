# F-003 · Servidor mínimo

**Estado:** **aprobada** por el dueño el 2026-10-22 (puerta 1: D1 **Fastify**, D2–D4)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** **`fastify`** 5.x (D1). Nada más: ni su integración con TypeBox ni plugins.

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** ✅ | **Framework web** | **Aprobado (dueño, 2026-10-22): Fastify** 5.x. *(La propuesta del arquitecto era Hono.)* | **2 paquetes sin dependencias** (ADR-0016: menos superficie de npm); API web estándar (`Request`/`Response`); se prueba **en proceso** sin abrir puertos; límite de cuerpo incluido; acepta un servidor HTTPS propio de Node (lo que necesita F-004 para el certificado de cliente); sirve también para la web de configuración más adelante |
| | Alternativas | **Fastify** 5.12: muy maduro, registro con ocultación de datos incluido, 47 paquetes, valida con Ajv (genera código) salvo que se cambie. **Express** 5.3: el más conocido, 65 paquetes, diseño más viejo. **`node:http` directo**: 0 paquetes, pero rutas, errores y límites a mano (más código propio que revisar) | Los validadores del contrato ya hacen la validación (ADR-0019): del framework solo se necesita rutear, limitar y servir |
| **D2** ✅ | ¿Qué vistas sirve, si el motor de vistas (F-005) aún no existe? | Una **fuente de vistas de demostración** dibujada por código en `raw1`, para **cualquier panel declarado**: `demo` (tres casillas que se marcan con el botón), `detalle` (con `parent: "demo"`, se abre desde `demo`) y `patron` (**patrón de calibración**: borde y **cuadrícula de 1 cm calculada con los ppp** del panel) | Prueba todo el ciclo sin el motor de vistas; el patrón sirve para comprobar con una regla, en la placa real, que el tamaño físico es correcto (D5 de F-001) |
| **D3** ✅ | ¿Autenticación? | **Ninguna en F-003**, y por eso el servidor **solo escucha en 127.0.0.1** y **se niega** a escuchar en otra dirección (falla cerrado) hasta F-004 | Nada se expone sin la capa L1 (ADR-0007) |
| **D4** ✅ | ¿Dónde guarda el estado (casillas marcadas, acciones vistas)? | **En memoria** en F-003; la base de datos (SQLite, ADR pendiente) llega con la primera integración real | Evita decidir la base de datos antes de tiempo |

## Listo para programar
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] Contrato, interfaz, puertos y archivos escritos.
- [x] Presupuestos y reglas de seguridad nombrados.
- [x] Fuera de alcance escrito.
- [x] Nombres de archivos, rutas, puertos y URLs escritos (puerto por defecto **8790**; las pruebas usan puerto efímero o pruebas en proceso).

## Contexto
Con el contrato (F-001) y el emulador (F-002) listos, falta el servidor que hable el contrato de verdad. Esta ficha lo arma con vistas de demostración, para probar el ciclo completo **pantalla ↔ servidor** con el emulador, antes de tener el motor de vistas (F-005), las integraciones ni la exposición a internet (F-004). Incluye las mejoras de seguridad anotadas en F-001.

## Alcance
- Las 5 rutas del contrato v1 con sus errores.
- Fuente de vistas de demostración (D2) con caché: se dibuja **solo cuando cambian los datos**.
- Acciones idempotentes que cambian el estado de la demostración.
- Registro estructurado sin contenido (S6).
- Límites de tamaño y de tiempo (mejoras de F-001).
- Arreglo de `contract/scripts/serve.ts` con rutas que tengan `:` (mejora de F-001).

**Fuera de alcance:** autenticación y certificado de cliente (F-004); exponer a internet; motor de vistas e integraciones; base de datos (D4); empaque en Docker (se decide en otra ficha); varios aparatos con estado propio (en F-003 todos comparten el estado de la demostración); `png1`.

## Contrato

### Cómo se usa Fastify (D1)
- **Sin esquemas de ruta de Fastify**: la validación es la del contrato (ADR-0019); así no se usa el compilador de Ajv (que genera código).
- El cuerpo JSON se lee **como texto** (`addContentTypeParser` con `parseAs: "string"`) con `bodyLimit: 4096`, y se valida con los validadores del contrato.
- `logger: false`: el registro es propio (sección *Registro*), con un *hook* `onResponse`.
- El manejador de errores convierte los errores de Fastify al contrato: cuerpo demasiado grande → **413** `ErrorBody` `too_large`; y `setNotFoundHandler` responde **404 sin cuerpo**.
- Tamaño y tiempo de cabeceras con las opciones del servidor de Node (p. ej. `serverFactory` o las opciones de Fastify que lo permitan).

### Arranque (`npm run server -- …`, en `server/src/main.ts`)
```
[--port N (8790)]  [--host 127.0.0.1]  [--next-wake-s N (1800)]  [--headers-timeout-ms N (10000)]
```
- `--host` distinto de `127.0.0.1` → sale con **2** y un mensaje que explica que falta F-004 (D3).
- Escucha HTTP en `127.0.0.1:<port>`. Ctrl+C / SIGTERM: cierre ordenado.
- `--port 0` elige un puerto libre y lo imprime en la primera línea: `{"listening":"http://127.0.0.1:<puerto>"}`.

### Interfaz para pruebas (`server/src/index.ts`)
```ts
import type { Panel, Zone } from "../../contract/src/index.ts";
export interface ServerConfig { nextWakeS: number; headersTimeoutMs: number }
export interface DemoView { id: string; parent?: string; raw1(panel: Panel): Uint8Array; zones(panel: Panel): Zone[] }
export function createApp(config: ServerConfig): { app: FastifyInstance; renders(): number }; // pruebas en proceso con app.inject()
export function startServer(config: ServerConfig, port: number): Promise<{ url: string; close(): Promise<void> }>;
export function demoViews(): DemoView[];   // con el estado actual de la demostración
```
`renders()` cuenta cuántas veces se dibujó una imagen (para probar la caché).

### Rutas (las del contrato v1, F-001)
- **Todas** validan las cabeceras con `validateDeviceHeaders` (y además: `Tintero-Firmware` y `Tintero-Formats` ≤ **64** caracteres). Si fallan → **400** `invalid_request`. Si `Tintero-Formats` no incluye `raw1` → **400** `invalid_request` (solo hay `raw1`).
- `GET /api/v1/index` → `IndexResponse` válido: `panel` = el declarado; `current` según el estado (`demo` al arrancar; `detalle` después de abrirlo); `views` en este orden: `demo`, `detalle`, `patron`; `next_wake_s` = `--next-wake-s`; `full_refresh: false`; cada vista `format: "raw1"`, `bytes = raw1Bytes(panel)` y su `crc32`.
- `GET /api/v1/views/{id}/image?h=<hash>` → la imagen `raw1` (`application/octet-stream`, `Content-Length`, `ETag: "<hash>"`). `If-None-Match` igual → **304**. `h` distinto de la huella actual → **409** `stale_view`. Vista inexistente → **404** `unknown_view`.
- `GET /api/v1/views/{id}/zones?h=<hash>` → `ZonesResponse` válido; mismos 409 y 404.
- `POST /api/v1/actions` → `ActionsResponse`. Idempotente por `id` (recuerda los últimos **1000**): la segunda vez, `duplicate` sin aplicar. Zona o vista inexistente → `stale`. `index_changed: true` si algo cambió.
- `POST /api/v1/log` → **204**; cada entrada se escribe en el registro del servidor.
- Cualquier otra ruta o método → **404 sin cuerpo**.
- Los errores del contrato llevan `ErrorBody` válido.
- **Huella** de una vista: los primeros **16** dígitos hexadecimales del SHA-256 de su imagen más sus zonas. Cambia solo si cambia el contenido.

### Vistas de demostración (D2), para cualquier panel
Coordenadas en píxeles del panel declarado; `u = round(min(w, h) / 24)` es la unidad de la demostración (en 800 × 480: 20 px).
- **`demo`**: borde negro de 2 px; tres casillas `c1`, `c2`, `c3` (zonas `toggle`) de `6u × 2u` en `x = u`, `y = 2u, 5u, 8u`; una casilla marcada se dibuja **rellena de negro**, sin marcar solo con su borde de 2 px; una zona `abrir` (`open`) de `6u × 2u` en `x = u, y = 11u`.
- **`detalle`**: `parent: "demo"`; borde de 2 px y un rectángulo negro relleno de `4u × 4u` en `x = u, y = u`; sin zonas.
- **`patron`**: borde negro de 2 px y una **cuadrícula de 1 cm**: líneas verticales de 1 px en `x_k = round(k × dpi / 2,54)` y horizontales en `y_k = round(k × dpi / 2,54)`, para `k = 1, 2, …` mientras queden dentro del panel; sin zonas.
- Toda zona queda dentro del panel y mide al menos 8 px (si el panel es muy chico, se acota).

### Acciones de la demostración
- `toggle` sobre `c1`/`c2`/`c3` (vista `demo`): invierte su estado → cambia la imagen y la huella de `demo`.
- `open` sobre `abrir`: `current` pasa a `detalle`.
- Cualquier otra combinación → `stale`.

### Límites y tiempos (mejoras de F-001)
- Cuerpos de `POST`: **≤ 4096 bytes**, comprobado **antes de leer más** (por `Content-Length` y cortando la lectura si se pasa) → **413** `too_large`, aunque el cuerpo no sea JSON válido.
- Cabeceras: `maxHeaderSize` del servidor **8192**; cabeceras sin terminar en `--headers-timeout-ms` → se cierra la conexión.
- `contract/scripts/serve.ts`: montar con `--mount type=bind,source=…,target=…` (acepta rutas con `:`) en lugar de `-v`. Exporta **`dockerArgs(kind: "docs" | "mock", specPath: string, port: number): string[]`** y **no corre al importarse** (solo con `import.meta.main`); usado como script, se comporta igual que hoy. *(Aclarado el 2026-10-23, a pedido del verificador.)*

### Registro (S6)
Una línea JSON por petición en la salida estándar: `{ "ts", "method", "route", "status", "bytes", "ms", "firmware", "power" }`. `route` sin la cadena de consulta. **Nunca** cuerpos, imágenes, zonas, ni otras cabeceras. Las entradas de `POST /api/v1/log` salen como `{ "ts", "device_log": { "level", "msg" } }` con `msg` sin caracteres de control y ≤ 200.

## Requisitos
- R1. Código en `server/src/`, con pruebas unitarias; usa el contrato para todo lo que recibe y lo que manda (valida sus propias respuestas en las pruebas).
- R2. Dibujo de las vistas en `raw1` con funciones propias (líneas, rectángulos, rellenos), sin dependencias.
- R3. `server/README.md`: primera línea descriptiva; cómo arrancar el servidor y probarlo con el emulador.

## Criterios de aceptación
Las pruebas arrancan el servidor con `startServer(config, 0)` (puerto efímero, 127.0.0.1) o usan `createApp(...).app.inject()` en proceso. HTTP a 127.0.0.1 solo con la función auxiliar de `docs/seguridad.md`. Carpetas temporales del emulador fuera del repo, borradas al terminar.

- **CA1.** `npm run server -- --port 0` imprime `{"listening":"http://127.0.0.1:<puerto>"}` y responde; `--host 0.0.0.0` sale con 2 sin escuchar.
- **CA2.** `GET /api/v1/index` con cabeceras válidas (panel 800 × 480, `raw1`) pasa `validateIndex`; `views` = `demo`, `detalle`, `patron` en ese orden; `current = "demo"`; `detalle.parent = "demo"`; `panel` igual al declarado; `bytes = 48000`; `next_wake_s = 1800`.
- **CA3.** **Ciclo con el emulador:** `runWake` (F-002, `power: "usb"`) contra el servidor descarga las tres vistas sin errores; `screen.raw1` es byte a byte la imagen de `demo` que dibuja el servidor.
- **CA4.** Una segunda `runWake` sin cambios solo hace `GET index`; y `renders()` no aumenta al pedir otra vez las mismas imágenes (**caché**).
- **CA5.** `press(ok)` sobre `c2` → acción `applied`, `index_changed: true`; la huella de `demo` cambia y el emulador baja la nueva imagen, donde el interior de la casilla `c2` está relleno de negro. Repetir la misma acción (mismo `id`) → `duplicate` y la huella no cambia.
- **CA6.** `press(ok)` sobre `abrir` → el índice trae `current = "detalle"` y el emulador la muestra; `press(long-ok)` vuelve a `demo` **sin peticiones**.
- **CA7.** Con panel declarado `w=648,h=480,dpi=124,depth=1`: `bytes = 38880`; todas las zonas dentro del panel; en `patron`, la línea vertical de `k = 1` está en `x = round(124 / 2,54) = 49` (píxel negro en `(49, 240)`) y la de `k = 2` en `x = 98`, con blanco en `(48, 240)` y en `(50, 240)`.
- **CA8.** `h` vieja → **409** `stale_view`; `If-None-Match` con la huella actual → **304**; vista `nada` → **404** `unknown_view`; todos los cuerpos de error pasan `validateErrorBody`.
- **CA9.** Sin `Tintero-Power`, con `Tintero-Formats: png1`, o con `Tintero-Firmware` de 65 caracteres → **400** `invalid_request`.
- **CA10.** `POST /api/v1/actions` con 5000 bytes que **no** son JSON → **413** con `ErrorBody` válido `too_large` (no 400). Igual con cuerpo sin `Content-Length` (transferencia por partes) de 5000 bytes.
- **CA11.** `POST /api/v1/log` válido → **204** y una línea `device_log` en el registro con `level` y `msg`; un `msg` con un carácter de control sale sin él. Cuerpo inválido → **400**.
- **CA12.** `GET /`, `GET /api/v1/otra` y `DELETE /api/v1/index` → **404 sin cuerpo**.
- **CA13.** Con `headersTimeoutMs: 500`, una conexión que manda cabeceras incompletas se cierra en menos de 2 s.
- **CA14.** El registro tiene una línea JSON por petición con exactamente los campos de la ficha; no contiene el texto de ninguna cabecera salvo `Tintero-Firmware` y `Tintero-Power`, ni bytes de imágenes.
- **CA15.** `dockerArgs` de `contract/scripts/serve.ts` arma los argumentos con `--mount type=bind,source=<ruta>,target=…` y sin `-v`; una ruta con `:` queda intacta en ese argumento.
- **CA16.** **Después** del primer `GET index` (que puede dibujar las vistas), cinco pedidos seguidos de la imagen de `patron` con su huella **no** aumentan `renders()`; y con el mismo estado y panel, cada vista se dibuja **como mucho una vez** en total (`renders()` ≤ 3). *(Aclarado el 2026-10-23.)*

## Presupuestos
- `GET /api/v1/index` y una imagen ya en caché: **< 50 ms** cada uno en local.
- Dibujar las tres vistas de 800 × 480: **< 200 ms** en total.

## Seguridad
- [x] Toda entrada externa con **límite de tamaño antes de parsear** (cuerpos ≤ 4096, cabeceras ≤ 8192 y ≤ 64 por cabecera `Tintero-*` de texto).
- [x] Servicios locales solo en **127.0.0.1** (y el servidor se niega a otra dirección: D3).
- [x] Dependencias nuevas: solo las de D1.
- S6: el registro no lleva contenido. Sin `eval` ni generación de código.

## Archivos
- A crear: `server/src/*.ts` (app y rutas, configuración, arranque, vistas de demostración, dibujo `raw1`, estado, registro) y sus `*.test.ts`; `server/README.md` (reemplaza el actual).
- A tocar: `package.json` (`fastify` y script `server`), `package-lock.json`, `knip.json` (entrada del servidor), `contract/scripts/serve.ts` (y su prueba) por CA15.

## Resultado esperado
`npm run server` + `npm run emulator -- --server http://127.0.0.1:8790 --wakes 1` hace el ciclo completo de una pantalla real contra un servidor real, y `screen.png` muestra la demostración. Con `--keys tab,ok` se marca una casilla y la pantalla cambia.

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
