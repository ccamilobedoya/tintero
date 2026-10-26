**Informe del verificador · F-008 · fase pruebas · vuelta 2**

**Veredicto:** PRUEBAS LISTAS. No pude ejecutar las pruebas porque el código de F-008 aún no existe.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `contract.test.ts` |
| CA2 | PRUEBA ESCRITA | `contract.test.ts`. Negro = bit 1 confirmado y marca de supuesto quitada. |
| CA3 | PRUEBA ESCRITA | `render.test.ts` |
| CA4–CA7 | PRUEBA ESCRITA | `render.test.ts`, `engine.test.ts` |
| CA8, CA9 | PRUEBA ESCRITA | `engine.test.ts` |
| CA10 | PRUEBA ESCRITA | `emulator.test.ts` |
| CA11 | PRUEBA ESCRITA | `calibration.test.ts` |
| CA12 | PRUEBA ESCRITA | Pruebas anteriores actualizadas (ver abajo). El resultado de la suite completa queda para la verificación. |

**Pruebas anteriores actualizadas** (solo coordenadas, píxeles y cantidad de zonas):
- **F-005:**
  - CA7, CA9, CA10, CA12 y CA14: ya estaban actualizadas en la primera pasada.
  - CA20 (`cycle`): ya no mira el píxel fijo (17, 103). Pide la zona de t-001 al servidor y mira el centro de la casilla en `z.x + 6 + 7`.
  - CA21 (`preview`): ya no exige 13 zonas en `hoy`. Exige la regla de prefijo de ids, que haya al menos 1 y como máximo 13.
  - CA23 (`engine`): ya no mira el píxel fijo (17, 221). Toma la primera tarea pendiente visible en `hoy`, la marca como hecha y mira el centro de su casilla antes (≤ 8 píxeles negros) y después (≥ 12).
- **F-006:** CA3, CA4, CA6, CA7, CA8, CA9, CA12 y CA13 ya estaban actualizadas.
- **F-003:** CA2/D2 (`index`) y CA7 (`toggle`): las zonas de demostración pasan a x = 16 y w = 120. El cuadrado del detalle en (20, 20) no es zona y no cambia.

**Pruebas:** `tests/acceptance/F-008/` (6 archivos) más las pruebas anteriores tocadas.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**Comprobaciones:** `npm run typecheck`, `tsc -p tests/acceptance` y `eslint` salen sin errores (83 avisos antiguos en otras fichas). Corrí `prettier` sobre `tests/acceptance`.
**check-scope verificador:** ✅
