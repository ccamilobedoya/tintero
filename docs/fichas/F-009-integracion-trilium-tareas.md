# F-009 · Núcleo mínimo de integraciones y tareas de Trilium

**Estado:** **aprobada en sus decisiones** · el dueño aprobó D8–D10 de F-006 el 2026-10-24 (ADR-0040, ADR-0041) · antes de programar: F-006 cerrada y lo marcado *por verificar*
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna (el `fetch` de Node 24).

## Decisiones (aprobadas en F-006)

Esta ficha es la antigua «Parte B» de F-006 (D0: dos fichas). Sus decisiones se aprobaron allí:

| # | Decisión | Aprobado |
|---|----------|----------|
| **D1** ✅ | Atributos del tablero | `status` y `vence` (`categoria` pospuesta: se lee si existe); orden = posición en el tablero; cierre = fecha de modificación de `status` (ADR-0037) |
| **D2** ✅ | Etapa | La integración traduce el nombre de la columna a `todo` \| `doing` \| `done` (ADR-0038) |
| **D8** ✅ | Núcleo mínimo | Manifiesto TypeScript; llave en archivo local 600 hasta la bóveda; cliente HTTP vigilado; escribir pide `writes` y `allowWrite` (ADR-0040) |
| **D9** ✅ | Escribir sin pisar | Solo si `status` sigue siendo el que se leyó; si no, gana Trilium; sin conexión, reintento en cada lectura durante 24 h (ADR-0041) |
| **D10** ✅ | Sin conexión | Se entrega a `setSource` la hora de la última lectura buena; la pantalla dice «sin datos desde HH:MM» pasados 5 min (ADR-0041) |

## Diseños

Lo que esta integración alimenta (las pantallas son de F-006; HTML y generador en `docs/disenos/F-006/`). Son PNG de 1 bit del mismo Chromium del motor, con datos inventados.

**`hoy`, fase 1:** las tarjetas *En progreso* mandan, *Por hacer* va por `categoria`, `vence` a la derecha (invertida si ya pasó) y lo cerrado hoy en el riel.

![hoy, fase 1](../disenos/F-006/1-hoy-fase1.png)

**`tablero`:** las tres columnas del tablero de Trilium.

![tablero](../disenos/F-006/3-tablero.png)

**Estados de una fila**, incluida la fuente sin conexión (D10).

![estados](../disenos/F-006/7-estados.png)

**`hoy` con el calendario y en vertical** (cuando llegue el calendario; en vertical, el mismo `hoy`).

![hoy con calendario](../disenos/F-006/2-hoy-completa.png)

![hoy en vertical](../disenos/F-006/6-hoy.v.png)

**Futuro:** `trabajo` (Jira, misma etapa por `statusCategory`) y `mes`.

![trabajo](../disenos/F-006/4-trabajo.png)

![mes](../disenos/F-006/5-mes.png)

## Listo para programar (se marca antes de pedir aprobación)
- [ ] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [ ] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos. *(Falta el ETAPI falso de las pruebas: rutas y respuestas que imita.)*
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto
F-006 dibuja las tareas con datos de prueba. Esta ficha las trae del tablero Kanban de Trilium (ADR-0010) y escribe ahí la marca de *Hecho*: es la primera integración y la primera de doble vía (I4). Arranca el núcleo del documento 7 en su forma mínima (ADR-0040), sin esperar la base de datos ni la web. Aplican ADR-0009 (la integración pide, el núcleo concede), ADR-0035 (dibujar cuando hay información nueva) y las reglas I1–I11 de `docs/seguridad.md`.

## Alcance
Manifiesto, configuración de integraciones, cliente HTTP vigilado, `trilium-tareas` (lectura cada 60 s y escritura de `status`), conexión con el motor (`setSource` y el `toggle` de F-006), registro de llamadas sin contenido.

**Fuera de alcance:** bóveda cifrada, OAuth y web de configuración; Google Calendar y Jira; varios usuarios (I6); integraciones de terceros en proceso aparte (I10); avisos de vencimiento por Telegram (I9); avisos entrantes (I11: aquí solo se consulta).

## Requisitos
- R1. Código en `server/src/integrations/`, con pruebas unitarias contra un ETAPI falso en `127.0.0.1`; ninguna prueba toca un Trilium real.
- R2. Toda respuesta de Trilium se limita en tamaño **antes** de parsearla, y nada del contenido de las tareas ni la llave sale en registros ni en errores.
- R3. `server/README.md`: cómo crear el token ETAPI propio de la integración y dónde va el archivo de la llave (solo **instrucciones**, ADR-0023).
- R4. Lo que no cambie esta ficha sigue igual: las pruebas de aceptación de F-001 a F-006 pasan.

## Contrato
```ts
export interface Manifest {
  id: string; version: string; delivers: "tasks" | "events";
  hosts: string[];          // los que el núcleo deja pasar (I2)
  writes: boolean;          // I4
  pollS: number;            // cada cuánto lee (I11: se consulta, nada entra)
}
export interface GuardedHttp {   // la integración no ve la llave (I1) ni tiene otra red (I2)
  request(method: "GET" | "PATCH" | "POST", path: string, body?: unknown): Promise<{ status: number; json: unknown }>;
}
export function guardedHttp(base: URL, keyFile: string, manifest: Manifest, options?: { maxBytes?: number; timeoutMs?: number }): GuardedHttp;
export function readBoard(http: GuardedHttp, boardId: string, columns: Record<string, Stage>): Promise<Task[]>;
export function markStage(http: GuardedHttp, noteId: string, expected: string, next: string): Promise<"written" | "conflict">;
```
- **Configuración** (archivo local fuera del repo, ≤ 64 KiB; ejemplo `config/integrations.example.json`): URL base de ETAPI, ruta del archivo de la llave, id de la nota del tablero, `allowWrite`, nombres de las columnas por etapa (por defecto `Por hacer` → `todo`, `En progreso` → `doing`, `Hecho` → `done`). Campos desconocidos → error.
- **Lectura:** hijos de la nota del tablero, en su orden; de cada uno solo `title`, `status`, `vence`, `categoria` (si la tiene; hoy el tablero no la usa) y la fecha de modificación de `status` (→ `doneAt` si es *Hecho*) (I5). Una tarjeta con un `status` desconocido no entra (se registra sin contenido). Cada lectura llama `setSource("tareas", items, { readAt, ok })`.
- **Escritura:** ADR-0041. `toggle` del motor → `markStage` con el `status` leído como `expected`. Cada llamada se registra `{ ts, integration, host, method, status, ms }`, sin rutas con ids ni contenido (I7).
- **Por verificar antes de programar:** que ETAPI entregue los hijos en el orden del tablero, y qué permisos tiene un token ETAPI (Trilium no tiene tokens de solo lectura: el token puede todo, así que `allowWrite` y el manifiesto son la única barrera).

## Criterios de aceptación
Reloj fijo `2026-10-24T12:00:00Z` y zona `America/Lima`. ETAPI falso en `127.0.0.1` (función auxiliar de `docs/seguridad.md`).

- **CA1 (hosts).** `guardedHttp` contra un host que no está en `manifest.hosts` falla **sin** abrir conexión; una respuesta de más de `maxBytes` falla sin parsearse; una que tarda más de `timeoutMs` falla.
- **CA2 (lectura).** Con tres tarjetas (*Por hacer*, *En progreso*, *Hecho*), `readBoard` devuelve tres `Task` en el orden del tablero con `stage` `todo`, `doing`, `done`, y `doneAt` solo en la tercera; ningún otro campo de la nota llega al motor. Una cuarta con `status: "Bloqueada"` no entra.
- **CA3 (escritura).** `markStage` con el `status` esperado → `written` y el ETAPI falso recibe un PATCH del atributo; con otro `status` en el ETAPI → `conflict` y **ningún** PATCH. Con `allowWrite: false`, `toggle` → `stale` y ninguna llamada.
- **CA4 (sin conexión).** Con el ETAPI falso apagado, `toggle` se ve en la pantalla y queda pendiente; al volver, la siguiente lectura lo escribe. Pasadas 24 h, se descarta y se registra.
- **CA5 (hora de lectura).** Tras 6 min sin lectura buena, la franja de la vista dice «sin datos desde» con la hora de la última buena (F-006, CA10).
- **CA6 (registro).** Ninguna línea de registro contiene un título, un id de nota ni la llave.

## Presupuestos
Respuesta de ETAPI ≤ 1 MiB; tiempo máximo 5 s por llamada; lectura cada 60 s.

## Seguridad
- [ ] Toda entrada externa con **límite de tamaño antes de parsear** (respuestas de ETAPI, archivo de configuración, archivo de la llave).
- [ ] Servicios locales solo en **127.0.0.1** (el ETAPI falso de las pruebas).
- [ ] Dependencias nuevas: ninguna.
- [ ] I1, I2, I4, I5 e I7 de `docs/seguridad.md`, como dice ADR-0040.
- [ ] La llave no aparece en el repo, en registros ni en errores; en el repo solo las instrucciones (ADR-0023).

## Archivos
**A crear:** `server/src/integrations/{manifest,http,trilium-tasks}.ts` (+ pruebas), `config/integrations.example.json`, `tests/acceptance/F-009/`.
**A tocar:** `server/src/engine/engine.ts` (llamar la escritura al marcar), arranque del servidor (`--integrations <archivo>`), `server/README.md`.

## Resultado esperado
Con `--integrations`, una tarjeta nueva en el tablero de Trilium aparece en la pantalla en la lectura siguiente, y Aceptar la pasa a *Hecho* en Trilium sin pisar lo que se haya cambiado desde el celular.

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
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
