# Informe del programador · F-006 · vuelta 1

**Resultado:** entregado, con esa excepción. Pasan `typecheck`, `lint` de `server contract emulator tools`, `npm test` (322 pruebas), `format:check` y `tools/check-scope programador --base main`.

**Aceptación:** 345 pruebas pasan y falla 1: `tests/acceptance/F-007/docs-and-scan.test.ts` (CA6). No es de F-001 a F-005, que pasan.

**Aviso de lint:** `eslint tests` da 71 avisos en `tests/acceptance` (F-007 y otros). No son míos, pero `npm run lint` completo no sale limpio por ellos.

**Vista previa:** corrí `npm run render` con los ejemplos de esta ficha y `--now 2026-10-24T17:00:00Z`, y escribió `hoy.png` y `tablero.png`.
- Las zonas de `hoy` coinciden con CA3: `b-01` en `{10,77,476,74}`, `b-02` en `{10,271,476,24}`, `b-12` en `{508,70,282,24}`.
- Vi las imágenes y se parecen a los diseños.
- No medí los píxeles exactos de CA3 ni de CA4.
- No probé el motor con el Chromium real; solo la vista previa.

**Qué hice**
- **`config.ts`:** `Stage`, `stageOf`, y `stage` y `doneAt` en `Task`, con las validaciones de CA2. El bloque `task-board` acepta `stages`, `lead`, `group_by` y `density`.
- **`theme.ts`:** las cinco medidas nuevas (`strip`, `sectionGap`, `leadLine`, `metaLine`, `cardLine`).
- **`task-board.ts` (nuevo):** franjas, filas que mandan, `row`, `card`, casillas, `vence` invertido, vacío y «+N más», con la regla de «cabe».
- **`engine.ts`:**
  - `toggle` y `open` sirven a `task-board`.
  - `toggle` recuerda la etapa anterior.
  - `setSource(id, items, { readAt })` guarda la hora de la última lectura.
  - El aviso «sin datos desde» entra en la clave de dibujo, y `setSource` encola las vistas cuya clave cambió aunque `changed` sea `false`.
- **Exportaciones:** `stageOf`, `Stage` y `staleLabel` salen en `index.ts`; `staleLabel` vive en `dates.ts`.
- **Otros:** `view.ts` pasa `stale` al bloque, y `README.md` documenta el bloque (R3).
- **Pruebas:** `blocks/task-board.test.ts` cubre CA2, CA5, CA6, CA7, CA10 y CA11 con el `Renderer` falso, además de `hoy` (CA3, zonas y `hidden`), `tablero` (CA8, `hidden`) y vertical (CA9, `hidden`).

**Archivos fuera de la lista:** moví `groupTasks` de `task-list.ts` a `blocks/common.ts` para reutilizarla; no cambia el comportamiento de `task-list`.

**Dependencias:** ninguna.

**Notas**
- En `task-list`, una tarea sin `stage` sigue cambiando solo `done`, como en F-005. Con `stage` usa la lógica nueva.
- Quedó en `/tmp/f006out` la salida de la vista previa (fuera del repo); no pude borrarla sin aprobación.
- No usé tareas en segundo plano.
