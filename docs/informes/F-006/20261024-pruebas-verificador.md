## Informe del verificador · F-006 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **PRUEBAS LISTAS**

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `config.test.ts`: los datos de F-005 cargan; `stageOf` da done para `t-002` y todo para el resto; los ejemplos de F-006 cargan. |
| CA2 | PRUEBA ESCRITA | `config.test.ts`: 4 casos de datos y 6 de vistas, con la ruta JSON y sin títulos en el mensaje. También `setSource` con datos inválidos. |
| CA3 | PRUEBA ESCRITA | `render.test.ts` (Chromium): `overflow`, `tooSmall`, `gray`, las 11 zonas, `hidden` y todos los píxeles de la ficha. |
| CA4 | PRUEBA ESCRITA | `render.test.ts`: `(484,274)` y `(484,291)` negros; `(484,345)` y `(484,300)` blancos. |
| CA5 | PRUEBA ESCRITA | `engine.test.ts`: `b-12` y `b-13` sí, `b-14` no. A las 00:01 del 25 cambia la huella de las dos vistas, `hechas` queda sin zonas y el HTML dibujado contiene «Nada hecho hoy.». |
| CA6 | PRUEBA ESCRITA | `engine.test.ts`: `applied`, `renders` +2, 13 zonas en orden, `hidden.tareas = 0` y `hechas` en `{508,70,282,24}`. El segundo `toggle` devuelve la huella inicial; el mismo `id` da `duplicate`. |
| CA7 | PRUEBA ESCRITA | `render.test.ts`: la primera zona es `b-02` en `{10,133,476,24}` y `(11,47)` sigue negro. |
| CA8 | PRUEBA ESCRITA | `render.test.ts`: zonas en el orden de la ficha y `hidden`. |
| CA9 | PRUEBA ESCRITA | `render.test.ts`: `hoy` y `tablero` en V124 y P200, con zonas, `hidden` y `overflow`. |
| CA10 | PRUEBA ESCRITA | `config.test.ts`: `staleLabel` (tres casos). `engine.test.ts`: con `readAt` de 3 min, huella igual; con 10 min, `changed:false`, huella distinta y píxeles distintos solo dentro de la franja. |
| CA11 | PRUEBA ESCRITA | `render.test.ts`: orden `c-1, c-3, c-2` con categoría y `c-1, c-2, c-3` con `group_by: none`. |
| CA12 | PRUEBA ESCRITA | `engine.test.ts`: zonas `open`, `(13,90)` blanco, `toggle` da `stale`, `open` lleva a `hoy-d`. |
| CA13 | PRUEBA ESCRITA | `preview.test.ts`: `npm run render` sale con 0, escribe `hoy.png` y `tablero.png`, ambos válidos como png1, y las zonas pasan `validateZones` (11 en `hoy`). |

**Observaciones (no bloquean):**
- La ficha no dice en qué módulo se exporta `staleLabel`. Las pruebas la buscan en el punto de entrada público `server/src/engine/index.ts`, igual que `stageOf`. Si el programador la deja en otro lado, hay que exportarla ahí.
- `stageOf`, `staleLabel` y el tercer parámetro de `setSource` se leen con conversión de tipo, así que `typecheck` pasa antes de que exista el código.
- El orden de zonas de `tablero` en CA8 se prueba como lo escribe la ficha (`en_progreso`, `por_hacer`, `hechas`). Coincide con `tab`, no con el orden de `areas`, que es `por_hacer` primero. Si el programador usa el orden de `areas`, fallará, y la ambigüedad estará en la ficha.
- No ejecuté nada de Chromium en esta fase.

**Pruebas:** `tests/acceptance/F-006/` (`helpers.ts`, `config.test.ts`, `render.test.ts`, `engine.test.ts`, `preview.test.ts`; unas 35 pruebas).
`npm run typecheck`, `tsc -p tests/acceptance`, eslint y prettier no dan errores. Las pruebas fallarán hasta que exista el código.
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅
