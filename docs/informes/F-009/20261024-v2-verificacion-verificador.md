**Informe del verificador · F-009 · fase verificación · vuelta 2**

**Veredicto:** CUMPLE. Las pruebas de F-009 pasan 71 de 71 y el lote completo de aceptación pasa 451 de 451 (46 archivos). `npm test` pasa 368 pruebas, con 2 omitidas por diseño del proyecto.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA4 | PASA | `http.test.ts`. CA3 es de tiempo; pasó en la corrida aislada y en el lote completo (que es cuando hay carga). |
| CA5–CA6 | PASA | `board.test.ts` |
| CA7–CA10 | PASA | `flow.test.ts` |
| CA11 | PASA | `config.test.ts` |
| CA12 | PASA | `board.test.ts`, `flow.test.ts` y `http.test.ts` |
| CA13 | PASA (regresión) | Lote completo de aceptación (F-001 a F-007): 451 de 451. No hay una prueba propia de «`createEngine` sin `onToggle`». Lo cubren los tests de F-005 y F-006, que crean el motor sin `onToggle` y pasan. |
| CA14–CA16 | PASA | `recovery.test.ts`. CA14 es de tiempo y pasó en el lote completo. |
| CA17–CA20 | PASA | `state.test.ts` |
| CA21 | PASA | `state.test.ts`. Es de tiempo y pasó en el lote completo. |
| CA22–CA23 | PASA | `state.test.ts` |

**Hallazgos:** no vi fallos intermitentes. Corrí cada tanda una sola vez y no reintenté ninguna.

**Errores de eslint arreglados:** los 3 de `rig.ts` y `state.test.ts` ya no salen. Para `no-unsafe-member-access` puse una directiva de archivo con motivo, como ya se hace en F-006. En `rig.ts` quité la aserción `as Parameters<typeof createEngine>[0]`. También quité una directiva sobrante en `recovery.test.ts`. Ninguna prueba se debilitó.

**Herramientas:**
- `npx tsc --noEmit -p tests/acceptance`: sin errores.
- `npx eslint tests/acceptance/F-009 tests/acceptance/F-002`: 0 errores y 11 avisos `detect-object-injection`.

**Pruebas:** `tests/acceptance/F-009/` (`http`, `board`, `flow`, `config`, `recovery` y `state` con `.test.ts`, más `rig.ts`, `helpers.ts` y `etapi.ts`; 71 pruebas)
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅ (base HEAD)

**Sin medir:** no hay navegador para los controles de render de la skill de UX/UI. No aplican a esta ficha, que no cambia la interfaz.

