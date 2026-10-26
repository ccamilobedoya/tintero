## Informe del verificador · F-008 · fase verificación · vuelta 1 (cierre de dudas)

**Veredicto:** fase verificación → **CUMPLE**. Todos los criterios de F-008 pasan. La única prueba que falla es F-007 CA6, que depende de `tools/revisar` (el arquitecto la corre después, como acordamos).

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA(n) de F-008 | PASA | `tests/acceptance/F-008/*` pasan completas. |
| F-005 CA10 (regresión) | PASA | Ajusté la prueba a `tooSmall = ["jira"]` para `hoy` en V124, según la aclaración. |
| F-007 CA6 | NO ES FALLA DEL CÓDIGO | Falta `.revisar/semgrep.json`. Se genera con `tools/revisar --base main`, que corre el arquitecto. |

- **Aceptación completa:** 553 de 554 pruebas pasan, en 58 de 59 archivos. La que falla es F-007 CA6.
- **`npm test`:** pasa.
- **Reintento único tras `busy` en `index8`:** aceptado, queda como está.
- **Presupuesto por mediana:** aceptado, queda como está.
- **`tsc --noEmit -p tests/acceptance`:** sin errores.
- **`eslint tests/acceptance`:** 0 errores y 83 avisos de `detect-object-injection`.

**Pruebas:** `tests/acceptance/F-008/` y ajustes en `F-001/schemas.test.ts`, `F-005/render-hoy.test.ts` y `F-006/preview.test.ts`.
**Pruebas corregidas por contradecir la ficha:** solo `F-005/render-hoy.test.ts`. La prueba de CA10 esperaba `tooSmall = []` y ahora espera `["jira"]`, según la aclaración de F-005 CA10 que ya está en `main`. Los cambios de la pasada anterior en F-001, F-006 y los ayudantes de F-008 se conservan.
**check-scope verificador:** ✅ (base HEAD). No hice commit.
