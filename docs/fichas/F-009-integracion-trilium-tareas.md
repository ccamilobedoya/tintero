# F-009 · Núcleo mínimo de integraciones y tareas de Trilium

**Estado:** **cerrada** · integrada a `main` el 2026-10-24 por pedido del dueño («arreglar, luego commit y merge»), tras CUMPLE 23/23 y revisión sin bloqueantes. Decisiones: D17–D19 (ADR-0044, ADR-0045), D11–D16 (ADR-0042, ADR-0043); D1, D2 y D8–D10 de F-006 (ADR-0037, 0038, 0040, 0041)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna (el `fetch` de Node 24).

## Decisiones

Esta ficha es la antigua «Parte B» de F-006 (D0: dos fichas).

| # | Decisión | Aprobado |
|---|----------|--------|
| **D1** ✅ | Atributos del tablero | `status` y `vence` (`categoria` pospuesta: se lee si existe); orden = posición en el tablero; cierre = fecha de modificación de `status` (ADR-0037) |
| **D2** ✅ | Etapa | La integración traduce el nombre de la columna a `todo` \| `doing` \| `done` (ADR-0038) |
| **D8** ✅ | Núcleo mínimo | Manifiesto TypeScript; llave en archivo local 600 hasta la bóveda; cliente HTTP vigilado; escribir pide `writes` y `allowWrite` (ADR-0040) |
| **D9** ✅ | Escribir sin pisar | Solo si `status` sigue siendo el que se leyó; si no, gana Trilium; sin conexión, reintento en cada lectura durante 24 h (ADR-0041) |
| **D10** ✅ | Sin conexión | Se entrega a `setSource` la hora de la última lectura buena; la pantalla dice «sin datos desde HH:MM» pasados 5 min (ADR-0041) |
| **D11** ✅ | HTTP sin TLS hacia el ETAPI local | Excepción como la de CDP (F-005): `http://` **solo** hacia `127.0.0.1:<puerto>`, desde un único archivo (`server/src/integrations/http.ts`); cualquier otro host exige `https://`. Trilium corre en la misma máquina y su puerto solo escucha en `127.0.0.1`. Si Tintero pasa a un contenedor, la ficha del servicio permanente decide cómo llega (red del host o HTTPS). **ADR-0042** |
| **D12** ✅ | Rutas permitidas en el manifiesto | Un token ETAPI **lo puede todo** (verificado: Trilium no tiene alcances; el token solo guarda nombre y *hash*), incluso borrar notas. El manifiesto declara además **qué métodos y rutas** usa la integración (`GET /notes…`, `PATCH /attributes/…`), y el cliente vigilado rechaza lo demás sin llamar. Token **propio** de Tintero, revocable (S4). **ADR-0043** |
| **D13** ✅ | Lectura en dos llamadas | Cada lectura hace **dos** GET: la nota del tablero (sus `childNoteIds` vienen ya **en el orden del tablero**, verificado) y una búsqueda `#status` en profundidad 1 (trae título y atributos de todas las tarjetas a la vez). No una llamada por tarjeta. Si en Trilium se ordena una columna por un campo, Tintero sigue el orden manual (mejora futura: leer `board.json`). |
| **D14** ✅ | Qué tarjetas entran | Solo cuentan los atributos **propios** de la tarjeta (ETAPI también entrega los heredados del tablero). No entran: sin `status` propio, con un `status` que no es una columna configurada, o archivadas. **Nunca** se escribe un atributo heredado (cambiaría el tablero o la plantilla). Las *Hecho* de hace más de 26 h no se envían (la pantalla solo muestra lo cerrado hoy, ADR-0037; I5 y el tope de 500). |
| **D15** ✅ | `allowWrite` y `readonly` coinciden | Si la configuración dice `allowWrite: false`, la fuente del archivo de datos tiene que ser `readonly: true` (y al revés); si no, el servidor no arranca. Así Aceptar nunca marca algo que no se va a escribir. |
| **D16** ✅ | Antes de la primera lectura | Al arrancar, la integración llama `setSource(fuente, [], { readAt: <arranque> })`: si Trilium no responde desde el principio, a los 5 min la pantalla dice «sin datos desde <hora de arranque>» en vez de quedarse vacía sin aviso. *(D17 lo amplía: si hay estado guardado, se entrega lo último.)* |
| **D17** ✅ | Estado que sobrevive a un apagado | Los pendientes y la **última lectura buena** (tareas + hora) se guardan en un archivo local (`stateFile`, fuera del repo, 600), escrito de forma **atómica** (temporal + `fsync` + `rename`: un corte de luz deja el archivo viejo o el nuevo, nunca uno a medias). Al arrancar se cargan: la pantalla vuelve con lo último y «sin datos desde <hora real>» si Trilium aún no responde, y las marcas pendientes se escriben cuando vuelva (las 24 h siguen contando aunque el servidor esté apagado). Lectura de más de 24 h → se descarta (I5). Archivo dañado o con permisos abiertos → se ignora, se registra y se arranca limpio: **nunca impide arrancar**. El archivo guarda títulos de tareas (en el mismo servidor que ya guarda Trilium). «Sin datos desde» muestra el día si no es hoy (`sin datos desde 23/10 18:30`). **ADR-0044** |
| **D18** ✅ | Ningún fallo pasajero tumba el servidor | Se activa la regla de eslint `@typescript-eslint/no-floating-promises` con `ignoreVoid: false`, y se atrapan las **10** promesas sueltas que marca en el servidor (6 de F-009 y 4 de antes: una igual en `chromium.ts`); un rechazo sin atrapar mata el proceso en Node 24. Trilium es local, así que **sin internet las tareas siguen funcionando**; si Trilium está caído o arranca después de Tintero, se reintenta cada 60 s sin fin. El registro de lecturas fallidas no se inunda: una línea al caer, una por hora mientras siga caído y una al volver (con cuánto duró). **ADR-0045** |
| **D19** ✅ | El resto de la recuperación, en la ficha siguiente | Lo que no es de esta integración va a **F-010 · Servicio permanente y recuperación automática** (antes «ficha del servicio permanente»): arrancar con el sistema después de Docker y Trilium (esperando la red local, no internet), reiniciar si el proceso se cae, **relanzar el contenedor de Chromium si muere** (hoy solo se reconecta), esperar a Docker en vez de salir si no está listo, y una prueba de apagón real (lecciones del incidente de arranque del homelab). El dueño pidió hacerla **enseguida**, después de integrar esta. |

## Diseños

Lo que esta integración alimenta (las pantallas son de F-006; HTML y generador en `docs/disenos/F-006/`). Son PNG de 1 bit del mismo Chromium del motor, con datos inventados.

**`hoy`, fase 1:** las tarjetas *En progreso* mandan, *Por hacer* va por `categoria`, `vence` a la derecha (invertida si ya pasó) y lo cerrado hoy en el riel.

![hoy, fase 1](../disenos/F-006/1-hoy-fase1.png)

**`tablero`:** las tres columnas del tablero de Trilium.

![tablero](../disenos/F-006/3-tablero.png)

**Estados de una fila**, incluida la fuente sin conexión (D10).

![estados](../disenos/F-006/7-estados.png)

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos (ETAPI falso y sus datos, abajo).
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto
F-006 dibuja las tareas con datos de prueba. Esta ficha las trae del tablero Kanban de Trilium (ADR-0010) y escribe ahí la marca de *Hecho*: es la primera integración y la primera de doble vía (I4). Arranca el núcleo del documento 7 en su forma mínima (ADR-0040), sin esperar la base de datos ni la web. Aplican ADR-0009 (la integración pide, el núcleo concede), ADR-0035 (dibujar cuando hay información nueva), ADR-0039 (Aceptar marca *Hecho* y deshace) y las reglas I1, I2, I4, I5, I7, S4 y S6 de `docs/seguridad.md`.

**Verificado contra un Trilium real** (TriliumNext 0.106, 2026-10-24, por el arquitecto): un tablero es una nota `book` con `#viewType=board` (por plantilla); las columnas son las opciones de `label:status`; cada tarjeta es una hija con el atributo `status` propio; `GET /etapi/notes/<id>` entrega `childNoteIds` ordenados por posición (el orden manual del tablero) y **todos** los atributos, propios y heredados (los heredados traen otro `noteId`); `utcDateModified` de un atributo viene como `"2026-10-24 16:15:04.871Z"` (espacio, no `T`); `PATCH /etapi/attributes/<id>` acepta `{ "value" }` en etiquetas; una búsqueda con `ancestorNoteId` y `ancestorDepth=eq1` entrega las notas completas con atributos (unos 1,5 KB por tarjeta); los tokens ETAPI no tienen alcances.

## Alcance
Manifiesto, configuración de integraciones, cliente HTTP vigilado, `trilium-tareas` (lectura cada 60 s y escritura de `status`), conexión con el motor (`setSource` y un aviso de `toggle` nuevo), registro de llamadas sin contenido, opción `--integrations` del servidor.

**Fuera de alcance:** bóveda cifrada, OAuth y web de configuración; Google Calendar y Jira; varios usuarios (I6); integraciones de terceros en proceso aparte (I10); avisos de vencimiento por Telegram (I9); avisos entrantes (I11: aquí solo se consulta); crear o mover tarjetas desde la pantalla (solo *Hecho* y deshacer, ADR-0039); orden por campo de una columna (D13); el token real y la configuración real del dueño (fuera del repo).

## Requisitos
- R1. Código en `server/src/integrations/`, con pruebas unitarias contra un ETAPI falso en `127.0.0.1`; **ninguna prueba toca un Trilium real**. El programador escribe su propio ETAPI falso para las unitarias y el verificador el suyo en `tests/acceptance/F-009/`, los dos a partir de la sección *ETAPI falso* de esta ficha (así no se copian los errores).
- R2. Toda respuesta de Trilium se limita en tamaño **antes** de parsearla, y nada del contenido de las tareas, ningún id de nota o de atributo, ni la llave salen en registros ni en mensajes de error.
- R3. `server/README.md`: cómo crear el token ETAPI propio de Tintero (en Trilium: *Opciones → ETAPI → Crear token*, nombre `tintero`), dónde va el archivo de la llave (fuera del repo, permisos 600, solo el token en una línea) y cómo se revoca. Solo **instrucciones** (ADR-0023).
- R4. Sin `--integrations`, el servidor se porta igual que antes: las pruebas de aceptación de F-001 a F-007 pasan.
- R5. `docs/seguridad.md` tiene la sección de la excepción D11 (ya escrita por el arquitecto, ADR-0042).

## Contrato

### Manifiesto (`server/src/integrations/manifest.ts`)
```ts
export interface Route { method: "GET" | "PATCH"; prefix: string }   // "/notes", "/attributes/"
export interface Manifest {
  id: string;                        // "trilium-tareas"
  version: string;                   // "1"
  delivers: "tasks" | "events";
  hosts: "configured" | string[];    // "configured": solo el origen de baseUrl (servicio propio del dueño)
  routes: Route[];                   // D12: lo demás se rechaza sin llamar
  writes: boolean;                   // I4
  pollS: number;                     // cada cuánto lee (I11: se consulta, nada entra)
}
export const triliumTasksManifest: Manifest = {
  id: "trilium-tareas", version: "1", delivers: "tasks", hosts: "configured",
  routes: [{ method: "GET", prefix: "/notes" }, { method: "PATCH", prefix: "/attributes/" }],
  writes: true, pollS: 60,
};
```

### Cliente vigilado (`server/src/integrations/http.ts`, único archivo con `fetch` fuera de pruebas)
```ts
export type HttpErrorCode =
  | "host" | "route" | "write-denied" | "bad-path"
  | "key-missing" | "key-permissions" | "key-too-large" | "key-empty"
  | "timeout" | "too-large" | "network" | "status" | "bad-json";
export class IntegrationHttpError extends Error {
  constructor(readonly code: HttpErrorCode, readonly httpStatus?: number) { super(code); }
}
export interface GuardedHttp {   // la integración no ve la llave (I1) ni tiene otra red (I2)
  request(method: "GET" | "PATCH", path: string, body?: unknown): Promise<{ status: number; json: unknown }>;
}
export function guardedHttp(
  base: URL, keyFile: string, manifest: Manifest,
  options?: { maxBytes?: number; timeoutMs?: number; allowWrite?: boolean;
              log?: (line: Record<string, unknown>) => void; clock?: () => Date },
): GuardedHttp;
```
- **Al crearlo** (lanza `IntegrationHttpError`, sin abrir conexiones): `base` tiene que ser `https://…` o `http://127.0.0.1:<puerto>/…` (D11), si no `host`; con `hosts` lista, el `host` de `base` tiene que estar en ella, si no `host`. La llave: el archivo tiene que existir (`key-missing`), sin permisos para grupo ni otros (`mode & 0o077 === 0`, si no `key-permissions`), ≤ 4 KiB (`key-too-large`, se mira el tamaño antes de leer) y no vacío tras quitar espacios y saltos de línea (`key-empty`). Se lee **una vez**, al crearlo.
- **En cada `request`**, antes de llamar: `path` empieza con `/`, no empieza con `//`, no tiene `..`, `\`, `#` ni `://` (si no `bad-path`); método y `path` casan con alguna `route` (`path.startsWith(prefix)`, si no `route`); `PATCH` pide `manifest.writes` **y** `allowWrite === true` (si no `write-denied`). La URL es `base` + `path`, conservando el `pathname` de `base` (`http://127.0.0.1:N/etapi` + `/notes/x` → `/etapi/notes/x`).
- **Llamada:** cabecera `Authorization: <token>` (como pide ETAPI, sin `Bearer`), `Content-Type: application/json` si hay cuerpo, `redirect: "error"`. Tope de tiempo `timeoutMs` (por defecto **5000**) para toda la llamada, cuerpo incluido (`timeout`). La respuesta se lee por partes y se corta al pasar `maxBytes` (por defecto **1 048 576**; también si `Content-Length` ya lo pasa) → `too-large`. Error de red → `network`. Estado fuera de 200–299 → `status` con `httpStatus` (nunca el cuerpo). Cuerpo vacío → `json: null`; si no, `JSON.parse` (`bad-json` si falla).
- **Registro (I7, S6):** cada `request` que llega a la red escribe **una** línea por `log`: `{ ts, integration, host, method, status, ms }`. `ts` en ISO de `clock()`; `host` = `host` de `base`; `status` = 0 si no hubo respuesta (`timeout`, `network`). Nada más: ni rutas, ni ids, ni cuerpos, ni cabeceras.

### Configuración (`server/src/integrations/config.ts`)
```ts
export interface TriliumTasksConfig {
  source: string;            // id de la fuente de tipo "tasks" en el archivo de datos
  baseUrl: string;           // p. ej. "http://127.0.0.1:8080/etapi"
  keyFile: string;           // ruta absoluta
  boardNoteId: string;       // /^[A-Za-z0-9_]{1,32}$/
  allowWrite: boolean;
  columns: Record<string, Stage>;  // por defecto {"Por hacer":"todo","En progreso":"doing","Hecho":"done"}
}
export interface IntegrationsFile { version: 1; integrations: { "trilium-tareas"?: TriliumTasksConfig } }
export function loadIntegrations(file: string): IntegrationsFile;   // lanza ConfigError (de engine/config)
```
Archivo ≤ **64 KiB** (se mira antes de leer). Campos desconocidos, en cualquier nivel → error. `columns` es opcional en el archivo: si falta, `loadIntegrations` lo completa con el por defecto (por eso el tipo lo tiene siempre); si viene: 1 a 10 nombres de 1 a 40 caracteres, valores solo `todo`, `doing` o `done`, y al menos una columna `done` y una `todo`. `baseUrl` como en D11. Los mensajes llevan la ruta JSON del campo (`/integrations/trilium-tareas/baseUrl`) y nunca el valor. Ejemplo con valores de relleno: `config/integrations.example.json` (fuente `tablero` de `config/tablero.data.example.json`).

### Integración (`server/src/integrations/trilium-tasks.ts`)
```ts
export function readBoard(http: GuardedHttp, boardId: string, columns: Record<string, Stage>,
                          now: Date, log?: (line: Record<string, unknown>) => void):
  Promise<{ tasks: Task[]; statuses: Map<string, string> }>;
export function markStage(http: GuardedHttp, noteId: string, expected: string, next: string):
  Promise<"written" | "conflict">;
export interface TriliumTasks {
  start(): void;                    // primer ciclo ya, luego cada manifest.pollS
  cycle(): Promise<void>;           // un ciclo completo (en la fila); las pruebas lo llaman directo
  onToggle(change: ToggleChange): void;
  idle(): Promise<void>;            // espera a que la fila quede vacía (para las pruebas)
  stop(): Promise<void>;            // para el temporizador y espera la llamada en curso
}
export function createTriliumTasks(options: {
  http: GuardedHttp; config: TriliumTasksConfig; manifest: Manifest;
  engine: Pick<Engine, "setSource">; clock?: () => Date;
  log?: (line: Record<string, unknown>) => void;
}): TriliumTasks;
```

**`readBoard`** (D13, D14): `GET /notes/<boardId>` → `childNoteIds` (el orden); `GET /notes?search=%23status&ancestorNoteId=<boardId>&ancestorDepth=eq1&limit=1000` → `results`. Por cada id de `childNoteIds`, en orden, con su nota de `results` (si no está, no entra y se registra `no-status`): solo atributos con `noteId` igual al de la tarjeta y `type: "label"`. No entra si: no tiene `status` propio; su `status` no es una clave de `columns`; tiene `archived` (propio o heredado); el título queda vacío tras quitar espacios; es `done` y su cierre es de hace más de 26 h respecto de `now`. Al `Task`: `id` = `noteId`; `title` recortado a 200 caracteres (199 + `…` si era más largo); `stage` = `columns[status]`; `done = stage === "done"`; `doneAt` solo si es `done`, = `utcDateModified` del atributo `status` pasado a RFC 3339 (`"2026-10-24 16:30:00.000Z"` → `"2026-10-24T16:30:00.000Z"`); `due` = `vence` si es una fecha `YYYY-MM-DD` válida (si no, se omite); `category` = `categoria` si tiene de 1 a 40 caracteres. Ningún otro campo. Máximo **500** tareas (las primeras en orden). `statuses` = el `status` leído de cada tarea que entró. Cada tarjeta que no entra deja una línea `{ ts, integration, event: "skipped", reason }` con `reason` ∈ `no-status`, `unknown-status`, `archived`, `empty-title`, `old-done`, `too-many` (sin ids). Una respuesta sin la forma esperada → `IntegrationHttpError("bad-json")`.

**`markStage`** (ADR-0041, D14): `GET /notes/<noteId>`; busca el atributo `label` `status` **propio**. Si la nota no existe (404), no tiene `status` propio, o su valor no es `expected` → `"conflict"` **sin** PATCH. Si es `expected` → `PATCH /attributes/<attributeId>` con `{ "value": next }` → `"written"`. Otros errores se lanzan.

**Aviso de `toggle` del motor** (`server/src/engine/engine.ts`, único cambio ahí):
```ts
export interface ToggleChange { sourceId: string; taskId: string; stage: Stage; previous: Stage }
// EngineOptions gana: onToggle?: (change: ToggleChange) => void;
```
Se llama, una vez y después de aplicar, por cada `toggle` con resultado `applied` sobre una tarea con etapa (no en el `task-list` de F-005 sin `stage`). `stage` es la etapa nueva y `previous` la de antes. Si lanza, el motor lo atrapa, registra `{ ts, event: "onToggle-error" }` y sigue. Sin `onToggle`, todo igual que en F-006.

**Funcionamiento de `createTriliumTasks`:**
- Al crearse llama una vez `engine.setSource(config.source, [], { readAt: clock() })` (D16).
- Guarda `s[tarea]` = el último `status` conocido en Trilium (lo leído, o lo escrito con éxito) y, como mucho, **un pendiente por tarea**: `{ next: <columna deseada>, since }`. La columna de una etapa es la **primera** clave de `columns` con esa etapa.
- Todo lo que llama a Trilium va **en una fila**, una cosa a la vez (ciclos y escrituras no se cruzan).
- **`onToggle`** de la fuente `config.source` (las demás se ignoran): si la tarea no tiene `s`, se registra `{ event: "write", result: "unknown-task" }` y nada más. Si no, el pendiente pasa a ser `{ next: <columna de stage>, since: clock() }` (reemplaza al anterior, así un deshacer pisa la marca) y se pone en la fila una **escritura** de esa tarea.
- **Escritura** de una tarea (en la fila): si no hay pendiente, nada. Si `next === s`, se borra el pendiente sin llamar (fue un deshacer antes de escribir). Si no → `markStage(http, tarea, s, next)`: `written` deja `s = next` y borra el pendiente **solo si** su `next` no cambió mientras tanto (si cambió, vuelve a la fila); `conflict` borra el pendiente (gana Trilium); un error de red, tiempo o estado lo deja para el próximo ciclo (línea `pending`).
- **`cycle()`** (en la fila): 1) cada pendiente con `since` de hace más de **24 h** se descarta (línea `expired`); 2) escritura de cada pendiente restante; 3) `readBoard`: si sale bien, actualiza `s` con `statuses`, a cada tarea con pendiente le pone la etapa del pendiente (`stage`, `done`, y `doneAt` = `since` en ISO si es `done`), y llama `engine.setSource(config.source, tasks, { readAt: clock() })`; si falla, **no** llama `setSource` (la pantalla conserva lo último y la marca local) y deja `{ ts, integration, event: "read", ok: false, code }`.
- Cada escritura deja `{ ts, integration, event: "write", result }` con `result` ∈ `written`, `conflict`, `pending`, `expired`, `unknown-task`. Un ciclo nunca lanza hacia afuera; `start()` repite cada `pollS` sin solaparse.

### Servidor
`--integrations <archivo>` (pide `--views` y `--data`; si no, sale con 2). Al arrancar, **antes de arrancar Chromium** (los errores de CA11 no necesitan Docker): carga el archivo, comprueba que `source` exista en los datos con tipo `tasks` y que `readonly === !allowWrite` (D15), crea el cliente y la integración, conecta `onToggle` y llama `start()`; `stop()` entra en el apagado ordenado antes del motor. Cualquier error de configuración o de llave sale con **2** y un mensaje con la ruta JSON o el código (`key-permissions`…), nunca un valor ni el token. Las líneas de `log` van a la salida estándar como las demás.

## ETAPI falso (para las pruebas)
Servidor HTTP en `127.0.0.1`, puerto 0 (elige uno libre), `baseUrl = http://127.0.0.1:<puerto>/etapi`. Token `token-de-prueba-123`, en un archivo de una carpeta temporal **fuera del repo**, con permisos 600. Toda petición sin `Authorization: token-de-prueba-123` exacto → 401 `{"status":401,"code":"NOT_AUTHENTICATED","message":"…"}`. Guarda cada petición recibida (`method`, ruta con consulta, cuerpo) para que la prueba la mire. Se puede poner **sin conexión** (cierra cada conexión sin responder), **lento** (espera N ms antes de responder) o hacer que devuelva un cuerpo dado.

| Ruta | Respuesta |
|------|-----------|
| `GET /etapi/notes/tablero00001` | 200 `{ noteId, title: "Tablero", type: "book", childNoteIds, attributes: [] }` |
| `GET /etapi/notes?search=%23status&ancestorNoteId=tablero00001&ancestorDepth=eq1&limit=1000` (parámetros en cualquier orden; `search` decodificado = `#status`) | 200 `{ results: [<nota>…] }`: las tarjetas que tienen algún atributo `status` (propio **o heredado**), **en orden inverso** al del tablero (para probar que el orden sale de `childNoteIds`) |
| `GET /etapi/notes/<id>` de una tarjeta | 200 `<nota>`; id desconocido → 404 `{"status":404,"code":"NOTE_NOT_FOUND","message":"…"}` |
| `PATCH /etapi/attributes/<attributeId>` con `{ "value" }` | 200 con el atributo actualizado (`utcDateModified` = hora de la prueba); el falso cambia su estado. Id desconocido → 404 `ATTRIBUTE_NOT_FOUND` |
| Cualquier otra | 404 |

Una `<nota>` es `{ noteId, title, type: "text", utcDateModified, attributes: [...] }` y cada atributo `{ attributeId, noteId, type: "label", name, value, isInheritable: false, utcDateModified }` (fecha por defecto `2026-10-20 09:00:00.000Z`). **Toda** tarjeta trae además los dos heredados del tablero (`noteId: "tablero00001"`): `label:status` = `"promoted,alias=Estado,single,select,options=Por hacer;En progreso;Hecho"` y `label:vence` = `"promoted,alias=Vence,single,date"`.

**Datos** (`childNoteIds` en este orden):

| noteId | título | atributos propios (`attributeId`: nombre = valor, fecha) |
|--------|--------|------------------|
| `tarjeta00002` | `Soldar los pines` | `atrstatus002`: status = `En progreso`; `atrvence0002`: vence = `mañana` |
| `tarjeta00004` | `Esperar repuesto` | `atrstatus004`: status = `Bloqueada` |
| `tarjeta00001` | `Comprar pilas` | `atrstatus001`: status = `Por hacer`; `atrvence0001`: vence = `2026-10-26` |
| `tarjeta00005` | `Solo título` | ninguno |
| `tarjeta00003` | `Pagar el agua` | `atrstatus003`: status = `Hecho`, `2026-10-24 16:30:00.000Z` |
| `tarjeta00006` | `Heredada` | ninguno propio; heredado `status` = `Por hacer` con `noteId: "plantilla001"`, `attributeId: "atrplantilla"` |
| `tarjeta00007` | 250 veces `x` | `atrstatus007`: status = `Por hacer` |
| `tarjeta00008` | `Cerrada ayer` | `atrstatus008`: status = `Hecho`, `2026-10-23 12:00:00.000Z` |
| `tarjeta00009` | `Archivada` | `atrstatus009`: status = `Por hacer`; `atrarchiv009`: archived = `""` |

(Trilium real no devuelve archivadas en la búsqueda; el falso sí, para probar la defensa.)

## Criterios de aceptación
Reloj fijo **`2026-10-24T17:00:00Z`** (12:00 en Lima) salvo que se diga otra cosa; zona `America/Lima`. ETAPI falso como arriba; las pruebas lo llaman solo a través de la función auxiliar de `docs/seguridad.md`. `cfg` = `{ source: "tablero", baseUrl, keyFile, boardNoteId: "tablero00001", allowWrite: true }` (columnas por defecto). «El motor» = `createEngine` con `config/tablero.views.example.json`, un archivo de datos igual a `config/tablero.data.example.json` pero con `tablero.items = []`, un `Renderer` falso (`fakeRenderer()`) y el reloj de la prueba. «Espía» = un objeto con `setSource` que guarda cada llamada y la pasa al motor. «Esperar la fila» = `await idle()`.

- **CA1 (origen y rutas).** `guardedHttp` lanza `host`, y el falso no recibe nada, con: `base` `http://127.0.0.1:<p>/etapi` y `hosts: ["example.org"]`; `base` `http://192.168.1.10:8080/etapi` y `hosts: "configured"`; `base` `ftp://127.0.0.1:<p>/`. Con un cliente bueno, `request` lanza sin llamar: `bad-path` para `"notes/x"`, `"//example.org/x"`, `"/notes/../app"` y `"/notes/x#y"`; `route` para `GET /app/info` y `PATCH /notes/tarjeta00001`. El falso sigue con **0** peticiones.
- **CA2 (llave).** Con el archivo de la llave en `0644` → `key-permissions`; inexistente → `key-missing`; con 4097 bytes → `key-too-large`; con `"\n  \n"` → `key-empty`. Ningún `message` contiene `token-de-prueba-123`. Con la llave buena (con un salto de línea al final), el falso recibe `Authorization: token-de-prueba-123` exacto en cada petición, y ninguna propiedad propia del objeto `GuardedHttp` contiene el token.
- **CA3 (topes).** Respuesta de 1 048 577 bytes → `too-large` (también si el falso no manda `Content-Length`); con `timeoutMs: 200` y el falso lento 1500 ms → `timeout` antes de 1000 ms desde la llamada; sin conexión → `network`; 401 → `status` con `httpStatus: 401`; cuerpo `{` → `bad-json`. Cada uno deja exactamente una línea de registro con `status` 0 (`timeout`, `network`) o el estado recibido.
- **CA4 (escribir pide permiso).** Con `manifest.writes: false`, o con `allowWrite` ausente o `false`, `request("PATCH", "/attributes/atrstatus001", { value: "Hecho" })` → `write-denied` y 0 peticiones.
- **CA5 (lectura).** `readBoard(http, "tablero00001", <por defecto>, reloj, log)` hace **exactamente 2** peticiones (las dos GET de la tabla) y `tasks` es, en este orden y sin más campos:
  `{ id: "tarjeta00002", title: "Soldar los pines", done: false, stage: "doing" }`,
  `{ id: "tarjeta00001", title: "Comprar pilas", done: false, stage: "todo", due: "2026-10-26" }`,
  `{ id: "tarjeta00003", title: "Pagar el agua", done: true, stage: "done", doneAt: "2026-10-24T16:30:00.000Z" }`,
  `{ id: "tarjeta00007", title: <199 «x» + "…">, done: false, stage: "todo" }`.
  `statuses` tiene esas cuatro con su `status`. El registro tiene una línea `skipped` por cada una de `tarjeta00004` (`unknown-status`), `00005` (`no-status`), `00006` (`no-status`), `00008` (`old-done`) y `00009` (`archived`): como no llevan ids, se cuentan por `reason` (2, 1, 1, 1). Con `columns: { "Por hacer": "todo", "Bloqueada": "doing", "Hecho": "done" }`, `tarjeta00004` entra con `stage: "doing"` y `tarjeta00002` no.
- **CA6 (escritura sin pisar).** `markStage(http, "tarjeta00001", "Por hacer", "Hecho")` → `"written"`; el falso recibió `GET /etapi/notes/tarjeta00001` y luego `PATCH /etapi/attributes/atrstatus001` con cuerpo exactamente `{"value":"Hecho"}`. Con el falso cambiado a `En progreso` → `"conflict"` y **ningún** PATCH. `markStage` sobre `tarjeta00006` (solo heredado) y sobre `tarjeta99999` (404) → `"conflict"` y ningún PATCH; en particular **nunca** un PATCH a `atrplantilla`.
- **CA7 (marcar y deshacer de punta a punta).** Motor + espía + `createTriliumTasks` con `onToggle` conectado al motor. Tras `cycle()`, el espía recibió primero `([], { readAt: reloj })` (D16) y luego las 4 tareas de CA5. Un `toggle` del motor sobre la zona de `tarjeta00001` en `hoy` → `applied`; tras esperar la fila, el falso recibió `PATCH /etapi/attributes/atrstatus001` `{"value":"Hecho"}`. Otro `toggle` (otro `id`) sobre la misma tarea → PATCH `{"value":"Por hacer"}`. Aparte: con el falso lento 300 ms, un `toggle` y su deshacer seguidos (sin esperar) → tras esperar la fila, a lo sumo **2** PATCH, el falso termina en `Por hacer`, y el siguiente `cycle()` entrega `tarjeta00001` con `stage: "todo"`.
- **CA8 (gana Trilium).** Tras `cycle()`, el falso cambia `tarjeta00001` a `En progreso` (como desde el celular); `toggle` en la pantalla → tras esperar la fila, ningún PATCH y una línea `{ event: "write", result: "conflict" }`; el siguiente `cycle()` entrega al espía `tarjeta00001` con `stage: "doing"`.
- **CA9 (sin conexión y 24 h).** `cycle()` bueno a las 17:00Z; falso sin conexión; `toggle` sobre `tarjeta00001` a las 17:01Z → `applied` y, tras esperar la fila, línea `result: "pending"`; `cycle()` a las 17:02Z → ninguna llamada nueva al espía; el falso vuelve; `cycle()` a las 17:03Z → el GET de la tarjeta y el PATCH `{"value":"Hecho"}` llegan **antes** de las dos GET de la lectura, línea `written`, y el espía recibe `tarjeta00001` con `stage: "done"`. Aparte: sin conexión, `toggle` a las 17:01Z, reloj en `2026-10-25T17:01:01Z`, el falso vuelve, `cycle()` → línea `expired`, **ningún** PATCH, y el espía recibe `tarjeta00001` con `stage: "todo"`.
- **CA10 (hora de lectura).** En el escenario de CA9, el `readAt` de cada llamada al espía es el reloj de ese ciclo, y tras el fallo de las 17:02Z el último `readAt` entregado sigue siendo 17:00Z. Con el falso sin conexión desde el arranque (reloj 17:00Z) y un `cycle()`, la única llamada al espía es `([], { readAt: 17:00Z })`, y `staleLabel(<ese readAt>, 17:06Z, "America/Lima") = "sin datos desde 12:00"`.
- **CA11 (configuración y arranque).** `loadIntegrations` lanza `ConfigError` con la ruta JSON para: un archivo de 65 537 bytes; un campo `"token"` en `trilium-tareas`; `columns` con `"Hecho": "closed"`; `columns` sin ninguna `done`; `baseUrl` `http://192.168.1.10:8080/etapi`; `boardNoteId` `"../x"`. Ningún mensaje contiene el valor. El servidor con `--integrations` sale con **2**: sin `--views`/`--data`; con `source: "nada"`; con `allowWrite: false` y la fuente `readonly: false` (D15); con la llave en `0644` (mensaje con `key-permissions`); los mensajes de los otros casos llevan la ruta JSON (`/integrations/trilium-tareas/source`, `/integrations/trilium-tareas/allowWrite`). `config/integrations.example.json` carga sin errores con `loadIntegrations`.
- **CA12 (registro).** Juntando **todas** las líneas de registro de la integración y del cliente en CA5 a CA10: ninguna contiene un título de la tabla, un `noteId` o `attributeId` de la tabla, `tablero00001` ni `token-de-prueba-123`; cada línea de una llamada tiene exactamente las claves `ts`, `integration`, `host`, `method`, `status`, `ms`.
- **CA13 (regresión).** `npm run test:acceptance` (F-001 a F-007) pasa; `createEngine` sin `onToggle` se porta igual que en F-006.

## Vuelta 2 · recuperación y mejoras (pedido del dueño, 2026-10-24)

Lo de arriba sigue valiendo salvo donde esta sección dice **reemplaza**. El programador parte de `dev/F-009` (vuelta 1 ya verificada) y el verificador agrega pruebas para CA14–CA23 sin quitar las de CA1–CA13.

### Requisitos
- R6. **Promesas** (D18): el arquitecto ya activó en `eslint.config.js` `@typescript-eslint/no-floating-promises` con `{ ignoreVoid: false }`. El programador atrapa **todas** las que la regla marque en `server/`, `emulator/`, `contract/` y `tools/` (medido con la regla sobre `dev/F-009`: 10, en `server/src/{app,main}.ts`, `server/src/engine/{engine,chromium}.ts`, `server/src/integrations/http.ts` ×3 y `trilium-tasks.ts` ×3; más 1 en `tests/acceptance/F-002/testserver.ts`, que arregla el **verificador**), con `.catch(...)` que registre sin contenido o, si el rechazo es esperado, `.catch(() => undefined)` con un comentario de por qué. Sin `eslint-disable`.
- R7. **Rutas por segmento** (mejora 2): el prefijo de una ruta casa con la ruta igual, o seguida de `/` o `?`; nada más (`/notesXYZ` → `route`).
- R8. **Columnas en los errores** (mejora 3): los punteros de error de `columns` usan la **posición** (`/integrations/trilium-tareas/columns/1`), no el nombre de la columna. Los nombres de campos desconocidos siguen como en el motor.
- R9. **Estado persistente** (D17), **cierre** y **olvido** (mejora 4), y **registro sin inundar** (D18), como dice el contrato de abajo.
- R10. `server/README.md` y `server/src/integrations/README.md`: qué guarda `stateFile`, que tiene títulos de tareas y que se puede borrar sin perder nada de Trilium (solo las marcas aún no escritas).

### Contrato (cambios)
- **Configuración:** `TriliumTasksConfig` gana `stateFile?: string` (ruta absoluta). Sin él, todo vive en memoria como en la vuelta 1. `config/integrations.example.json` lo trae (valor de relleno). Al arrancar el servidor, si `stateFile` viene, su carpeta tiene que existir y poder escribirse; si no, sale con 2 y el puntero `/integrations/trilium-tareas/stateFile`.
- **Archivo de estado** (`server/src/integrations/state.ts`):
  ```ts
  export interface SavedState {
    version: 1; boardNoteId: string; savedAt: string;                 // RFC 3339
    lastGood: { readAt: string; tasks: Task[] } | null;               // lo leído, sin pendientes encima
    statuses: Record<string, string>;                                 // s[tarea]
    pending: Record<string, { next: string; since: string }>;
  }
  export function loadState(file: string, boardNoteId: string, now: Date):
    { state: SavedState | null; problem?: "missing" | "permissions" | "too-large" | "bad-json" | "other-board" };
  export function saveState(file: string, state: SavedState): Promise<void>;   // atómico; lanza si no puede
  ```
  `loadState` no lanza nunca: archivo inexistente → `missing`; con permisos para grupo u otros → `permissions`; más de **1 MiB** (se mira antes de leer) → `too-large`; JSON inválido o sin la forma → `bad-json`; otro `boardNoteId` → `other-board`. En todos, `state: null`. Si `lastGood.readAt` tiene más de **24 h** respecto de `now`, `lastGood` vuelve `null` (los `statuses` y `pending` se conservan). `saveState` escribe `<file>.tmp-<pid>` en la misma carpeta con permisos 600, `fsync`, `rename` sobre `file` y `fsync` de la carpeta; si algo falla, borra el temporal y lanza.
- **Arranque de la integración** (**reemplaza** el primer punto de *Funcionamiento*): con `stateFile`, `loadState`; si `problem` no es `missing`, una línea `{ ts, integration, event: "state", ok: false, problem }`. Se recuperan `statuses` y `pending` (los pendientes de tareas sin `status` conocido se descartan). Si hay `lastGood`, la primera llamada es `setSource(source, <lastGood.tasks con los pendientes encima>, { readAt: <lastGood.readAt> })`; si no, `setSource(source, [], { readAt: clock() })` como en D16. Si `setSource` rechaza las tareas guardadas, se registra `{ event: "state", ok: false, problem: "bad-json" }` y se sigue como sin `lastGood`.
- **Cuándo se guarda:** tras cada cambio de `pending` (un `toggle`, una escritura terminada, un vencimiento) y tras cada lectura buena cuyo resultado (tareas o `statuses`) cambió **o** cuyo `readAt` es al menos **5 min** posterior al `lastGood.readAt` guardado (si no, un tablero quieto dejaría en el archivo una hora vieja: tras reiniciar, «sin datos desde» mentiría o la lectura se descartaría por vieja). *(Aclaración de la vuelta 2, hallada por el programador.)* Una escritura del archivo a la vez; si llega otro cambio mientras se escribe, se guarda una vez más al terminar con lo último. Si `saveState` lanza, `{ event: "state", ok: false, problem: "write" }` y se sigue en memoria (se reintenta en el próximo cambio). **Nunca** se escribe el archivo sin `stateFile`.
- **Olvido** (mejora 4): tras una lectura buena, `s` y los pendientes de tareas que ya no están en `statuses` se borran; cada pendiente borrado así deja `{ event: "write", result: "gone" }` (`result` gana `gone`).
- **`stop()`** (**reemplaza** su comentario): para el temporizador, **no empieza** nada más de la fila y espera solo la llamada en curso (a lo sumo `timeoutMs`); lo que quedó en la fila sigue en `pending` (y en el archivo, si hay `stateFile`). Termina en ≤ `timeoutMs` + 500 ms.
- **Registro de lecturas** (**reemplaza** la línea de ciclo fallido): la primera lectura fallida tras una buena (o desde el arranque) deja `{ ts, integration, event: "read", ok: false, code }`; mientras siga fallando, otra igual cada **60 min** (contados desde la primera); la primera buena tras fallos deja `{ ts, integration, event: "read", ok: true, downS }` (segundos desde la primera fallida). Las lecturas buenas seguidas no dejan línea. Las líneas del cliente HTTP (una por llamada, I7) no cambian.
- **«Sin datos desde» con día** (`server/src/engine/dates.ts`, `staleLabel`): si `readAt` no es del mismo día local que `now`, el texto es `sin datos desde DD/MM HH:MM`; si es del mismo día, igual que antes.

### ETAPI falso (cambios)
Un modo más: **corta a media respuesta** (manda cabeceras y la mitad del cuerpo de `GET /etapi/notes/tablero00001` y se queda callado).

### Criterios de aceptación (vuelta 2)
Mismo reloj, datos y falso; `stateFile` en una carpeta temporal fuera del repo. «Rechazos sueltos» = lo que recoge un `process.on("unhandledRejection")` puesto por la prueba durante el CA.

- **CA14 (sin rechazos sueltos).** Con `timeoutMs: 200` y el falso en «corta a media respuesta» → `timeout`; con el falso mandando 1 048 577 bytes en trozos de 64 KiB → `too-large`; con 500 → `status`. En los tres, tras esperar 500 ms, **0** rechazos sueltos. `npx eslint .` no da ningún error de `no-floating-promises`.
- **CA15 (rutas por segmento).** `GET /notesXYZ` y `PATCH /attributesX/1` → `route` y 0 peticiones; `GET /notes`, `GET /notes/x` y `GET /notes?search=%23status` pasan el chequeo de ruta.
- **CA16 (columnas en errores).** `columns` `{ "Por hacer": "todo", "Hecho": "closed" }` → `ConfigError` con puntero `/integrations/trilium-tareas/columns/1`; el mensaje no contiene `Hecho` ni `closed`.
- **CA17 (apagado y vuelta).** Con `stateFile`: `cycle()` bueno a las 17:00Z → el archivo existe, tiene permisos 600, y `lastGood.readAt` es `2026-10-24T17:00:00.000Z`. Falso sin conexión; `toggle` sobre `tarjeta00001` a las 17:01Z → tras esperar la fila, el archivo tiene ese pendiente con `next: "Hecho"`. `stop()`. Una integración **nueva** con el mismo archivo, reloj 17:30Z, falso aún sin conexión: su primera llamada al espía trae las 4 tareas de CA5 con `tarjeta00001` en `stage: "done"` y `readAt` 17:00Z (no `[]`). El falso vuelve; `cycle()` → PATCH `{"value":"Hecho"}` y el archivo queda sin pendientes.
- **CA18 (24 h también apagado).** Archivo con `lastGood.readAt` = 2026-10-23T16:59:00Z `statuses` `{ "tarjeta00001": "Por hacer" }` y un pendiente de `tarjeta00001` con `since` 2026-10-23T16:59:30Z; integración nueva a las 17:00Z del 24 → primera llamada `([], { readAt: 17:00Z })`; con el falso arriba, `cycle()` → línea `expired` y **ningún** PATCH.
- **CA19 (archivo dañado no impide arrancar).** Con el archivo en `{`, con 1 048 577 bytes, con permisos 0644 y con otro `boardNoteId`: la integración se crea sin lanzar, la primera llamada es `([], { readAt: reloj })`, hay una línea `state` con `problem` `bad-json`, `too-large`, `permissions` y `other-board` respectivamente, y tras un `cycle()` bueno el archivo es válido (lo carga `loadState` sin `problem`) y con permisos 600.
- **CA20 (escritura atómica).** Tras 50 `toggle`/deshacer seguidos con el falso arriba y esperar la fila, la carpeta tiene **solo** el archivo de estado (ningún `.tmp-*`) y `loadState` lo carga sin `problem`. `saveState` hacia una carpeta inexistente lanza y no deja temporal. El servidor con `stateFile` en una carpeta inexistente sale con 2 y el puntero `/integrations/trilium-tareas/stateFile`.
- **CA21 (cierre y olvido).** Falso lento 2000 ms; tres `toggle` sobre tres tareas distintas y `stop()` enseguida, con `timeoutMs` 5000 → `stop()` termina en ≤ 5500 ms, el falso recibe a lo sumo **1** petición tras llamar `stop()`, y el archivo tiene los pendientes que no se escribieron. Aparte: tras un `cycle()`, el falso quita `tarjeta00001` del tablero; con un pendiente suyo sin escribir (falso sin conexión en la escritura, vuelve antes de la lectura), el siguiente `cycle()` buena deja `result: "gone"` y el pendiente desaparece.
- **CA23 (la hora guardada no envejece).** Con `stateFile` y el tablero sin cambios: `cycle()` bueno a las 17:00Z, 17:01Z, 17:02Z, 17:03Z y 17:04Z → `lastGood.readAt` del archivo sigue siendo `2026-10-24T17:00:00.000Z`; tras el `cycle()` de las 17:05Z es `2026-10-24T17:05:00.000Z`. Una integración nueva con ese archivo a las 17:06Z entrega `readAt` 17:05Z.
- **CA22 (registro sin inundar y día en el aviso).** Lectura buena a las 17:00Z; falso sin conexión; `cycle()` cada minuto de 17:01Z a 18:05Z (65 ciclos) → exactamente **2** líneas `read` `ok: false` (17:01Z y 18:01Z); el falso vuelve, `cycle()` a las 18:06Z → una línea `{ event: "read", ok: true, downS: 3900 }`. `staleLabel(new Date("2026-10-23T23:30:00Z"), new Date("2026-10-24T17:06:00Z"), "America/Lima") = "sin datos desde 23/10 18:30"`; los valores de F-006 CA10 siguen igual.

### Archivos (vuelta 2)
**A crear:** `server/src/integrations/state.ts` (+ prueba). **A tocar:** `server/src/integrations/{http,config,trilium-tasks}.ts` (+ pruebas), `server/src/engine/dates.ts`, los archivos que marque la regla de R6 (hoy `server/src/{app,main}.ts`, `server/src/engine/{engine,chromium}.ts`), `server/src/main.ts` (chequeo de `stateFile`), `config/integrations.example.json`, los dos README. Ya hecho por el arquitecto: `eslint.config.js` (R6), ADR-0044 y ADR-0045. `chromium.ts` es zona sensible: solo se toca lo que marque la regla.

### Presupuestos (vuelta 2)
Archivo de estado ≤ 1 MiB; a lo sumo una escritura del archivo en curso; `stop()` ≤ `timeoutMs` + 500 ms.

## Presupuestos
Respuesta de ETAPI ≤ 1 MiB; 5 s por llamada; lectura cada 60 s; **2 GET por lectura** + 1 GET y 1 PATCH por escritura; ≤ 500 tareas al motor; pendientes ≤ 24 h desde el `toggle`.

## Seguridad
- [ ] Toda entrada externa con **límite de tamaño antes de parsear**: respuestas de ETAPI (1 MiB), archivo de configuración (64 KiB), archivo de la llave (4 KiB).
- [ ] Servicios locales solo en **127.0.0.1** (el ETAPI falso); `http://` solo hacia `127.0.0.1` (D11, zona sensible: `http.ts` con un único `fetch` marcado).
- [ ] Dependencias nuevas: ninguna.
- [ ] I1 (la integración no ve la llave), I2 (solo el cliente vigilado, solo el origen configurado), I4 + ADR-0043 (rutas y escritura explícitas), I5 (solo los campos de `Task`; *Hecho* viejas fuera), I7 + S6 (registro sin contenido ni ids), S4 (token propio y revocable).
- [ ] La llave no aparece en el repo, en registros ni en errores; en el repo solo las instrucciones (ADR-0023).

## Archivos
**A crear:** `server/src/integrations/{manifest,http,config,trilium-tasks}.ts` (+ sus `*.test.ts`), `server/src/integrations/README.md`, `config/integrations.example.json`, `tests/acceptance/F-009/` (verificador).
**A tocar:** `server/src/engine/engine.ts` (`onToggle`), `server/src/args.ts` y `server/src/main.ts` (`--integrations`), `server/README.md` (R3). Ya hechos por el arquitecto: `docs/seguridad.md` (R5), ADR-0042 y ADR-0043.

## Resultado esperado
Con `--integrations`, una tarjeta nueva en el tablero de Trilium aparece en la pantalla en la lectura siguiente (≤ 60 s), y Aceptar la pasa a *Hecho* en Trilium sin pisar lo que se haya cambiado desde el celular. Si Trilium no responde, la pantalla sigue mostrando lo último, guarda la marca y avisa «sin datos desde HH:MM».

## Terminado (se marca al cerrar)
- [x] Todos los CA pasan en la verificación (informe adjunto): CA1–CA23.
- [x] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [x] `tools/check-scope` limpio para cada rol.
- [x] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [x] El dueño aprobó integrar (2026-10-24, condicionado a que la vuelta 2 saliera limpia).

---

## Resultado obtenido

**Vuelta 1** (antes del pedido del dueño):

- **Pruebas primero:** el verificador escribió 49 pruebas de aceptación con su propio ETAPI falso; ningún CA quedó NO VERIFICABLE. Tres supuestos suyos se resolvieron con aclaraciones de la ficha (`columns` por defecto al cargar, validar `--integrations` antes de Chromium, contar los `skipped` por `reason`), sin cambiar nada aprobado.
- **Código (vuelta 1):** `server/src/integrations/{manifest,http,config,trilium-tasks}.ts` + pruebas unitarias (351 en total), `onToggle` en el motor, `--integrations` en el servidor, `config/integrations.example.json` y las instrucciones del token en `server/README.md`. Archivo extra justificado: `server/src/integrations/testing.ts` (ETAPI falso de las unitarias, como `engine/testing.ts`).
- **Verificación:** **CUMPLE 13/13 a la primera**; el lote completo de aceptación (429 pruebas, F-001 a F-009) pasa, sin pruebas intermitentes.
- **Revisión:** `tools/revisar` limpio con salida 3 por la zona sensible `http.ts`; el revisor (Sonnet, juicio) **sin bloqueantes**, confirmó I1, I2/D11, ADR-0043, I4, I5, I7/S6, topes y la fila de escrituras.
- **Desvío de proceso:** `tools/sensitive-paths.txt` nombraba `server/src/integrations/http/**` (carpeta prevista que no existe) y no atrapaba `http.ts`; se agregó la ruta real antes de la revisión (`fcaa623`).
- **Mejoras anotadas** (revisor):
  1. `http.ts`: `void response.body?.cancel()` / `void reader.cancel()` sin `.catch`. Hoy se llaman sobre flujos sanos, pero un rechazo sin atrapar tumba el proceso en Node 24 → agregar `.catch(() => undefined)`. Lección candidata: `no-floating-promises` con `ignoreVoid: false`.
  2. Prefijo de ruta `"/notes"` también acepta `/notesXYZ` (inofensivo por el origen) → comparar por segmento.
  3. `config.ts`: el puntero de error incluye el nombre de una clave del archivo (columna o campo desconocido); para S6 estricto, usar el índice.
  4. `stop()` espera la fila sin cancelarla (el apagado ya lo acota) y `known` no olvida tareas borradas.
- **Costo en agentes:** USD 2,65 (verificador 0,93 + 0,17, programador 1,36, revisor 0,18, integrador 0,01).

**Vuelta 2** (pedido del dueño en la puerta 2: arreglar las mejoras y que el servidor se recupere solo):

- **Decisiones nuevas:** D17 estado en disco (ADR-0044), D18 ninguna promesa suelta (ADR-0045, regla de eslint), D19 el resto a F-010.
- **Pruebas:** CA14–CA22 y luego CA23 (71 pruebas de F-009 en total); el verificador también arregló la promesa suelta de `tests/acceptance/F-002/testserver.ts`. Pruebas y código en paralelo.
- **Código:** `server/src/integrations/state.ts` (escritura atómica, carga que nunca lanza), persistencia, olvido, `stop()` sin esperar la fila y registro sin inundar en `trilium-tasks.ts`; rutas por segmento en `http.ts`; punteros por posición en `config.ts`; `stateFile` en el arranque; día en `staleLabel`; las **10** promesas sueltas atrapadas (6 de F-009, 4 de `app`, `main`, `engine` y `chromium`).
- **Aclaración hallada por el programador (vuelta 3):** el archivo solo se guardaba si cambiaban las tareas; con el tablero quieto quedaba una hora vieja y, tras reiniciar, «sin datos desde» habría mentido. Se agregó guardar también cuando el `readAt` avanza 5 min (CA23).
- **Verificación:** **CUMPLE 23/23** (vuelta 2), lote completo 451/451, las de tiempo también con carga, sin intermitentes.
- **Revisión:** salida 3 (zonas `http.ts` y `chromium.ts`); revisor sin bloqueantes, las 4 mejoras de la vuelta 1 resueltas. **Mejoras nuevas, pasan a F-010:** (1) `persist`: si `snapshot()` lanzara, `saveRunning` quedaría en `true` sin aviso (hoy no puede lanzar: solo arma un objeto) → `finally`; (2) `runCycle`: un defecto de código cae en `readFailed` y queda limitado a una línea por hora → separar errores de red de los inesperados; (3) `write`: la línea `pending` sin código; (4) `saveState`: abrir el temporal con `"wx"`; (5) `loadState`: leer del mismo descriptor. Lección candidata: `catch` vacío sin motivo.
- **Costo vuelta 2–3:** USD 2,46 (verificador 0,68 + 0,11 + 0,13, programador 1,25 + 0,11, revisor 0,14, integrador 0,03). **Total F-009: USD 5,11.**

## Resumen para aprobar

## Para aprobar · F-009 · Núcleo mínimo de integraciones y tareas de Trilium

**Qué cambió:** el servidor lee el tablero «To Do» de Trilium cada 60 s y Aceptar marca *Hecho* sin pisar lo hecho desde el celular. Ahora además sobrevive a apagados: guarda en disco las marcas pendientes y la última lectura, vuelve con ellas al arrancar, y ningún fallo pasajero lo tumba.

**Criterios:** 23 de 23 pasan · vueltas: verificación 2 (13/13 y 23/23), revisión 2

**Revisión:** sin bloqueantes, 5 mejoras que pasan a F-010 · zonas sensibles: `http.ts`, `chromium.ts`
**Dependencias nuevas:** ninguna

**Riesgos o pendientes:** F-010 (arranque con el sistema, relanzar Chromium, esperar Docker); token ETAPI `tintero` y su llave para usarlo de verdad.

**Decisión que se pide:** ya aprobada por el dueño: integrar a `main`.
