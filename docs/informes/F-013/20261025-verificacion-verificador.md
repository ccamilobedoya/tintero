## Informe del verificador · F-013 · fase verificación · vuelta 1

**Veredicto:** NO CUMPLE, solo por CA20. CA1–CA19 pasan. CA20 falla porque F-005 CA27 falla, y ese fallo no es de esta ficha.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA4 | PASA | `logic.test.ts`: configuración, `applyCorrections`, `holidayLabel` y `eventDays` dan los valores de la ficha. |
| CA5 | PASA (con una prueba corregida) | `setHolidays` devuelve `changed` true, luego false, y `ok:false` con la fecha mala y con 401 entradas. El `hash` de `hoy` cambia tras el primero y no cambia tras el segundo. |
| CA6–CA11 | PASA | `draw.test.ts`: píxeles, negritas, 6 semanas, vertical, vista sin lugar (`hidden.mes = 7`) y caso sin festivos. |
| CA12–CA18 | PASA (CA12 con una prueba corregida) | `integration.test.ts`: la petición, el caché, los límites, el 404, la guardia del cliente, la integración apagada y los registros se comportan como dice la ficha. |
| CA19 | PASA (con una prueba corregida) | `cli.test.ts`: `hoy.png` coincide con CA6. Un archivo de 65 KiB y una fecha mala salen con código 2. |
| CA20 | FALLA | `previous.test.ts` corre F-005, F-006 y F-008. F-006 y F-008 pasan (84/84 por separado). F-005 falla en CA27 (`engine.test.ts`, «el primer index de cada uno no da busy»), también al correrlo solo. |

**Pruebas corregidas:** las tres fallas de CA5, CA12 y CA19 eran errores de mis pruebas, no del código.
- **CA5:** el renderer falso devolvía siempre el mismo bitmap, así que el `hash` no podía cambiar. Usé uno cuyo bitmap depende del HTML.
- **CA12:** `cycle()` no espera la escritura del `stateFile`. La ficha da `idle()` para eso, así que lo espero antes de comprobar el modo 600.
- **CA19:** usaba `decodePng` del motor, que no lee PNG de 1 bit. Ahora uso `decodePng1` de F-002 e invierto los bits (en PNG el 0 es negro, en `raw1` el 1 es negro).
- También agregué reglas de eslint desactivadas, con el motivo comentado, para los `any` del JSON de prueba.

**Fuera de esta ficha (no los reintenté):**
- F-005 CA27 falla siempre, no solo por carga: falló en el lote completo y también con F-005 solo.
- F-007 CA6 falla porque falta `.revisar/semgrep.json`, que deja `tools/revisar`.
- F-008 CA4 (presupuesto de 420 ms) falló en el lote completo por carga y pasó con F-008 solo.

**Totales:**
- **F-013:** 59 pruebas. Las 58 de CA1–CA19 pasan; falla CA20.
- **`npm test`:** 457 pasan y 2 saltadas.
- **`npm run test:acceptance` completo:** 609 de 613 pasan. Las 4 fallas son F-005 CA27, F-007 CA6, F-008 CA4 y CA20 (consecuencia de F-005 CA27).
- **Comprobaciones:** `tsc --noEmit -p tests/acceptance` y `eslint tests/acceptance` salen sin errores.

**Pruebas:** `tests/acceptance/F-013/…` (59 pruebas)
**check-scope verificador:** ✅

