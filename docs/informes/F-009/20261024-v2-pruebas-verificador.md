# Informe del verificador · F-009 · fase «pruebas» (vuelta 2)

**Veredicto: PRUEBAS LISTAS.** Ningún CA quedó NO VERIFICABLE. Las pruebas no se han podido correr: el código de la vuelta 2 y de `integrations/` no está en esta rama.

| CA | Prueba | Archivo |
|----|--------|---------|
| CA14 | Tres pruebas: `timeout`, `too-large` y `status`, cada una con 0 rechazos sueltos tras 500 ms. | `recovery.test.ts` |
| CA15 | `/notesXYZ` y `/attributesX/1` dan `route` sin llamar. `/notes`, `/notes/x` y `/notes?search=%23status` pasan el chequeo de ruta. | `recovery.test.ts` |
| CA16 | Puntero `/integrations/trilium-tareas/columns/1`; el mensaje no contiene `Hecho` ni `closed`. | `recovery.test.ts` |
| CA17 | Estado guardado con permisos 600, pendiente `Hecho`, `stop()`, integración nueva con las 4 tareas y `readAt` 17:00Z; al volver, PATCH y archivo sin pendientes. | `state.test.ts` |
| CA18 | Pendiente de más de 24 h guardado: primera llamada `([], reloj)`, línea `expired`, ningún PATCH. | `state.test.ts` |
| CA19 | Cuatro archivos dañados (`bad-json`, `too-large`, `permissions`, `other-board`): la integración se crea, hay una línea `state`, y tras un `cycle()` el archivo es válido y 600. | `state.test.ts` |
| CA20 | 50 `toggle`/deshacer sin `.tmp-*`. `saveState` a carpeta inexistente lanza sin dejar temporal. El servidor sale con 2 y el puntero `stateFile`. Además, `saveState` escribe 600 y `loadState` descarta `lastGood` de más de 24 h conservando `pending`. | `state.test.ts` |
| CA21 | `stop()` en ≤ 5500 ms con el falso a 2000 ms, a lo sumo 1 petición después, y los pendientes sin escribir en el archivo. También `gone` tras quitar la tarjeta. | `state.test.ts` |
| CA22 | 65 ciclos caídos dejan 2 líneas (17:01Z y 18:01Z). Al volver, una línea `ok` con `downS: 3900`. `staleLabel` da `sin datos desde 23/10 18:30`, y `12:00` no cambia. | `state.test.ts` |

- **Cambios de apoyo:**
  - **`etapi.ts`:** agregué `failNext` (descarta las próximas N peticiones) y `remove(noteId)` (saca una tarjeta del tablero). También atrapé su promesa suelta.
  - **`rig.ts` (nuevo):** servidor auxiliar para «corta a media respuesta» y «500», motor con `stateFile`, y esperas (`waitFor`, `sleep`).
- **R6:** atrapé la promesa suelta de `tests/acceptance/F-002/testserver.ts` con un `.catch` que cierra la conexión, sin cambiar lo que prueba. La regla ya no marca `no-floating-promises` en mis archivos nuevos.
- **Supuestos que el programador debe respetar:**
  - La prueba de CA22 espera que el `ts` de cada línea `read` sea el ISO de `clock()`.
  - En la prueba de `gone` el falso usa `failNext = 1`: la escritura falla y la lectura siguiente va bien.
  - Las esperas del archivo de estado son por sondeo (`waitFor`), no exigen que `idle()` espere la escritura.
- **Comprobaciones:**
  - `npm run typecheck` pasa.
  - `tools/check-scope verificador --base main` está limpio.
  - `eslint` sobre F-009 y F-002 sigue dando errores `no-unsafe-*` porque `state.ts` y `integrations/` no existen aquí, y otros en `helpers.ts` y `http.test.ts`, que son de la vuelta 1. No toqué esos archivos, porque la rama de verificación ya los arregló.
  - `npx tsc --noEmit -p tests/acceptance` falla solo por esos módulos que faltan (TS2307).
- Sin *commit*.

