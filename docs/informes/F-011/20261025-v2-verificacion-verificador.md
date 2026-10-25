## Informe del verificador · F-011 · fase verificación · vuelta 2

**Veredicto:** NO CUMPLE. CA9 falla en todas las ejecuciones: 4 de 4, sin intermitencia.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `F-011/*.test.ts` del lote, 22 de 23 pruebas verdes. |
| CA2 | PASA | Igual. |
| CA3 | PASA | Igual. |
| CA4 | PASA | Igual. |
| CA5 | PASA | Igual. |
| CA6 | PASA | Igual. |
| CA9 | **FALLA** | `vuelta2.test.ts` «docker pause». Esperado: tras `docker pause`, una vista nueva dibujada bien en ≤ 45 s con el mismo proceso y una línea `restart`. Obtenido: durante los 45 s las respuestas alternan 200 (vista vieja) y 503 busy (vista nueva, cada una tarda ~2 s), y nunca llega una vista nueva. Todas las respuestas son 200 o 503, así que esa parte sí se cumple. |
| CA10 | PASA | Las dos variantes (`run` sale con 1 y `run` tarda más que el tope) pasan. No quedan contenedores y hay un `rm -f` por intento. |

**Diagnóstico de CA9:** en los 45 s posteriores a `docker pause` no aparece ninguna línea `chromium` (ni `restart` ni fallo) y no hay nuevos registros `render`. Solo constan los dos `render` previos al `pause` (el `ok:true` de la vista inicial). La causa probable es que el dibujado no falla ni vence dentro de ese plazo. Por eso `supervise()` no se dispara: solo se invoca tras un `render` que lanza error.

**Otros resultados:**
- Lote completo `npm run test:acceptance`: 486 de 487 pasan. La única falla es CA9.
- `npm test`: 391 pasan y 2 se omiten.
- `tsc --noEmit -p tests/acceptance` pasa.
- `eslint tests/acceptance/F-011`: 0 errores y 1 *warning* (`security/detect-object-injection`, `vuelta2.test.ts:196`).
- Contenedores: no queda ninguno de mis pruebas. Los 3 `tintero-chromium-*` que siguen en pie son anteriores y no míos; no toqué el servicio real.
- Agregué un diagnóstico temporal a `vuelta2.test.ts` y lo quité. `git status` queda limpio.

**Pruebas:** `tests/acceptance/F-011/…` (23 pruebas en 5 archivos)
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅

