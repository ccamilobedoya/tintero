## Informe del verificador · F-008 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **FICHA NO VERIFICABLE**. Hay dos puntos que el arquitecto debe resolver (abajo). Las pruebas ya están escritas con el supuesto razonable en cada caso. Compilan, y `npx tsc --noEmit -p tests/acceptance` y eslint no dan errores en lo que toqué.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `contract.test.ts`: LIMITS, `zones-focus`, `unaligned` (x, w) en `/zones/<i>`, `focus_pad` en `/focus`, rangos de `focus`, `contract:check`. |
| CA2 | **NO VERIFICABLE** (prueba escrita con supuesto) | Ver punto 1. |
| CA3 | PRUEBA ESCRITA | `render.test.ts`: 2 conjuntos de ejemplos × P124, P200 y V124. Comprueba alineación, `bandInk`, `overflow`, `gray`, distancia a los bordes y a los divisores verticales, `validateZones` y `focus` por HTTP. |
| CA4 | PRUEBA ESCRITA | Zonas, `hidden` y los píxeles de la ficha. Además mide el presupuesto de 420 ms. |
| CA5 | PRUEBA ESCRITA | Zonas y `hidden` de `tablero`. |
| CA6 | PRUEBA ESCRITA | `toggle` sobre `z5b74b95d24`; el foco sigue a la tarea. |
| CA7 | PRUEBA ESCRITA | `text-decoration-thickness` de 2 px en P124 y 4 px en P200. |
| CA8 | PRUEBA ESCRITA | `engine.test.ts`: día local en Lima, aparato `otro`, reinicio, HTTP y modo demostración. |
| CA9 | PRUEBA ESCRITA | `current`, orden de dibujo con un `Renderer` falso, `Tintero-View` válido y `Tablero!` → 400. |
| CA10 | PRUEBA ESCRITA | `emulator.test.ts`: `renderScreen` con la regla del anillo en cada píxel, `Tintero-View` en cada petición y el foco tras `ok` (mismo id, mismo índice, última, `null`). |
| CA11 | PRUEBA ESCRITA | `calibration.test.ts`: CLI, rayas exactas en el PNG y en el motor, `overflow` y zonas vacíos, nombres de las 7 líneas, `ConfigError` si lleva `source`. |
| CA12 | **NO VERIFICABLE** como está escrito | Ver punto 2. Se comprobará con `npm run test:acceptance` completo. |

**Pruebas:** `tests/acceptance/F-008/` (6 archivos, unas 50 pruebas). Además actualicé, dentro de lo que la ficha permite:
- **F-005:** CA7, CA9, CA10, CA12 y CA14. Quedan ids como prefijo, `visibles + hidden` igual que antes, alineación, alturas de 30 y 49 px, y la casilla medida por columna relativa a la zona.
- **F-006:** CA3, CA4, CA6, CA7, CA8, CA9 y CA12, con los valores de CA4 y CA5 de esta ficha.

**Dos puntos que bloquean (preguntas al arquitecto):**
1. **CA2 se contradice.** Dice «Negro = bit 0 en `raw1` (como en F-001)», pero F-001 define **1 = negro**, igual que el resto de F-008. ¿Es 1 = negro? Escribí las pruebas con 1 = negro; si es al revés, solo hay que invertir los bytes de entrada.
2. **CA12 no se cumple con las pruebas autorizadas.** Estas pruebas anteriores van a fallar con la geometría nueva y no están en la lista de «Pruebas anteriores que cambian». No las toqué.
   - **F-005 CA20** (`cycle.test.ts`, píxel (17, 103)).
   - **F-005 CA21** (`preview.test.ts`: «hoy tiene 13 zonas»).
   - **F-005 CA23** (`engine.test.ts`: píxel (17, 221)).
   - **F-006 CA13** (`preview.test.ts`: «hoy tiene 11 zonas»).
   - **F-003 CA2/D2 y CA7**: las zonas de demostración usan `x: 20`, no alineado. El `validateZones` del emulador y el de las pruebas las rechazarían con `unaligned`.

   La pregunta es si se amplía la lista de la ficha o se cambian las zonas de demostración.

**Límites de lo que se puede comprobar:**
- **CA3:** los divisores horizontales no se pueden distinguir de las rayas de las franjas sin conocer su posición. Solo se comprueban los verticales (columnas negras de 100 px o más).
- **CA7:** el texto de las filas `b-12` y `b-13` se ubica por una ventana alrededor del título en el HTML, porque la ficha no fija la estructura.
- **CA9:** las vistas se identifican comparando el HTML contra el de un motor que solo la tiene a ella.
- **Emulador:** no pruebo que use `focus.ring` leído de las zonas, porque el servidor de prueba de F-002 no lo emite. Eso queda cubierto solo a nivel de `renderScreen`.
- **Presupuesto de CA4:** se mide en la prueba y se registra con `console.log`.

**Pruebas corregidas por contradecir la ficha:** ninguna.
**check-scope verificador:** ✅
