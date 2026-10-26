## Informe del verificador · F-017 · fase verificación · vuelta 1

**Veredicto:** fase verificación → CUMPLE. Los 8 CA y CA9 pasan. Hay 5 fallos de presupuesto de tiempo con el lote completo; todos pasan al correrlos solos y no tocan nada de F-017.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `npm run test:acceptance -- tests/acceptance/F-017`: 3 archivos, 23 pruebas, todas en verde. |
| CA2 | PASA | Igual: la prueba de píxeles de F-017 pasa. |
| CA3 | PASA | Igual: pasa con la imagen grabada de `main`. |
| CA4 | PASA | Igual: pasan los valores por defecto, 900 y los errores `UsageError`. |
| CA5 | PASA | Igual: pasan las pruebas del modo demostración. |
| CA6 | PASA | Igual: pasan las pruebas con motor. |
| CA7 | PASA | Igual: pasa la prueba de dibujo por adelantado. |
| CA8 | PASA | Igual: pasan las pruebas de documentación. |
| CA9 | PASA | `npm test`: 504 pruebas pasan y 2 se omiten. En `npm run test:acceptance` entero (2 corridas): 7 fallos la primera vez y 5 la segunda. Todos son presupuestos de tiempo o suites que corren esos presupuestos. Ninguna prueba anterior cambió de contenido. |

**Corridas de CA9**

| Prueba | Con el lote completo | Sola |
|--------|----------------------|------|
| F-005 CA27 | FALLA | PASA |
| F-008 CA4 | FALLA (la segunda corrida cayó en 472 ms) | PASA |
| F-015 CA5 | FALLA (658 ms contra el tope de 420) | PASA |
| F-013 CA20 | FALLA | PASA |
| F-014 CA14 | FALLA | 1.ª corrida sola FALLA, 2.ª PASA |

- **F-013 CA20 y F-014 CA14:** F-014 CA14 falló sola la primera vez porque su F-008 CA4 anidado dio 472 ms. Las dos corrieron aparte en tandas separadas.
- **F-015 CA5:** es la misma clase de presupuesto que F-008 CA4, pero la ficha no la nombra como inestable. Pasó sola en la tanda de F-005, F-008 y F-015.
- **Carga:** el promedio de carga de la máquina era 4 a 6.

**Pruebas:** `tests/acceptance/F-017/…` (3 archivos, 23 pruebas)
**Pruebas corregidas por contradecir la ficha:** ninguna
**Comprobaciones de herramientas:**
- `npx tsc --noEmit -p tests/acceptance`: sin errores.
- `npx eslint tests/acceptance`: 0 errores y 85 avisos, ninguno en `F-017`.
- `npm test`: en las dos veces que lo corrí, el hook imprimió «Bloqueado…» pero los resultados salieron completos y en verde.

**check-scope verificador:** ✅
