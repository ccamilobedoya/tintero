## Informe del verificador · F-018 · fase verificación · vuelta 1

**Veredicto:** CUMPLE. Los CA con prueba pasan. Hay una nota abierta sobre una prueba de otra ficha (F-005 CA27), que fue sensible a la carga de la máquina.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA0, CA12a, CA12b, CA17, CA20 | No los comprueba el verificador | Los comprueban el arquitecto o el dueño. |
| CA1–CA11 | PASA | `tests/acceptance/F-018/*`: 147 de 147 pasan. |
| CA10b, R10b, R10c | PASA | Mismo lote, mismo resultado. |
| CA13–CA16, CA18, CA19, CA21, CA22 | PASA | Mismo lote. CA21 se prueba contra `example-json.ts`. |

**Corridas completas:**
- **F-018 sola:** 147 de 147 pasan. La primera corrida tuvo 2 fallas, las dos por la prueba (ver más abajo).
- **Todas las fichas:** 893 de 894 pasan. Falla F-005 CA27 («tres motores… no da busy»); F-013 CA20 (que la repite) falló en la primera corrida pero no en la segunda.
- **F-005 y F-013 juntas:** F-005 CA27 y F-013 CA20 fallan otra vez.
- **F-005 `engine.test.ts` sola:** 8 de 8 pasan. La carga era de 5,9 con la otra prueba de Chromium en marcha.
- **Interpretación:** F-005 CA27 es la falla conocida por carga; F-018 no toca ese código. No la reproduje sin otras pruebas corriendo a la vez.
- **`npm test`:** 546 pasan y 2 se omiten.
- **`tools/revisar --base main`:** corrió antes para F-007 CA6; F-007 pasó.

**Pruebas:** `tests/acceptance/F-018/…` (7 archivos, 147 pruebas). `tsc` y `prettier` limpios. `eslint` da 0 errores y 85 avisos que ya estaban en pruebas de otras fichas.

**Pruebas corregidas por contradecir la ficha:** dos, ambas en `legal.test.ts`; el código y los documentos estaban bien.
- **CA1:** exigía las mismas líneas partidas a 80 columnas. El texto MIT de `LICENSE` es idéntico, pero con un párrafo por línea. Ahora compara párrafos con los espacios normalizados.
- **CA3:** el regex no veía «**not** required» por los asteriscos del Markdown. Ahora quita `*`, `_` y `` ` `` antes de buscar.

**check-scope verificador:** ✅
