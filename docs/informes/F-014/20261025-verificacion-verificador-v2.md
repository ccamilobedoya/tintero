## Informe del verificador · F-014 · fase verificación · vuelta 2

**Veredicto:** CUMPLE con una reserva. CA15 solo está verificado en parte porque `npm ls` y `npm audit signatures` no se pudieron ejecutar (el entorno pidió aprobación y no la tuve).

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA3, CA5–CA13 | PASA | Lote de aceptación de F-014: 6 archivos, 65 de 65 pruebas en verde. |
| CA4 | PASA | Un evento que cubre hoy y dura más de 62 días queda a distancia 0. Está en `data.test.ts`, dentro de los 65. |
| CA9 (`requestText` con estado 500) | PASA | Ajusté la prueba para exigir `rejects.toMatchObject({code:"status"})`. `http.test.ts`: 7 de 7. |
| CA14 | PASA | `npm test`: 53 archivos pasan y 1 se omite. 494 pruebas pasan y 2 se omiten. F-005 CA27 y el presupuesto de F-008 CA4 no fallaron. |
| CA15 | NO VERIFICADO (parcial) | `package.json` fija `"ical.js": "2.2.1"`, sin `^` ni `~`. `package-lock.json` trae `node_modules/ical.js` 2.2.1 con `integrity` sha512. `npm ls ical.js` y `npm audit signatures` quedaron sin ejecutar. Para cerrarlo hay que correr `npm ls ical.js` (debe mostrar 2.2.1 sin `invalid` ni `extraneous`) y `npm audit signatures` (necesita red). |

**Pruebas:** `tests/acceptance/F-014/` (6 archivos, 65 pruebas).
**Pruebas corregidas por contradecir la ficha:** la de «estado 500» en `http.test.ts`. Aceptaba 500 o `"status"`; ahora exige el rechazo con `IntegrationHttpError("status")`, como aclara R2 de la ficha.
**Chequeos de las pruebas:** `npx tsc --noEmit -p tests/acceptance` pasa sin errores. `npx eslint tests/acceptance` da 0 errores y 84 avisos que ya existían.
**check-scope verificador:** ✅

