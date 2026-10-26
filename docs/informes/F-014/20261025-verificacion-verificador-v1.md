## Informe del verificador · F-014 · fase verificación · vuelta 1

**Veredicto:** NO CUMPLE. Falla el CA4 en un caso de borde (R6). El resto cumple, y CA14 pasó entero la segunda vez que corrí el lote.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `data.test.ts`: `icon` y `calendar` inválidos dan error con puntero, los seis pictogramas se aceptan y `setSource` devuelve `ok: false`. |
| CA2 | PASA | `data.test.ts`: los 11 eventos salen en orden, con ids y campos correctos. |
| CA3 | PASA | Dos casos nuevos: diario a las 09:00 de Bogotá desde 2019 da 94 repeticiones y `truncated = 0`; `MINUTELY` da `truncated > 0` en menos de 3 s. Los demás casos del CA3 también pasan. Presupuesto de 8 MiB con 20 000 eventos: menos de 3 s. |
| CA4 | **FALLA** | Con 300 + 300 eventos da 500 y `dropped = 100`: pasa. Pero un evento que cubre hoy y dura más de 62 días (`2026-08-01` a `2026-12-31`, hoy `2026-10-25`) no queda a distancia 0. Con límite 5 se descarta `largo`; esperado: incluido. Causa: `mergeCalendars` usa `eventDays`, que corta a 62 días (`MAX_EVENT_DAYS`, `engine/dates.ts:159`), así que el evento deja de cubrir hoy. |
| CA5 | PASA | `calendars-file.test.ts` pasa. |
| CA6 | PASA | `integration.test.ts` pasa. |
| CA7 | PASA | `integration.test.ts` pasa. |
| CA8 | PASA | `integration.test.ts` pasa. |
| CA9 | PASA | `http.test.ts` pasa, con una prueba ajustada (ver abajo). |
| CA10–CA12 | PASA | `draw.test.ts` pasa. |
| CA13 | PASA | `draw.test.ts` y `previous.test.ts`: las vistas sin `icon` son idénticas a las de antes. |
| CA14 | PASA, con intermitentes | Primera corrida: falló F-005 CA27 (`busy`). Segunda corrida: falló el presupuesto de F-008 CA4 (mediana 442 ms contra 420 ms). Corridos solos, F-005 `engine.test.ts` (8/8) y F-008 `render.test.ts` (12/12) pasan. El lote anidado de `previous.test.ts` no lo repetí después de estas dos corridas: pasa solo cuando no cae uno de esos dos intermitentes. F-007 CA6 no falló. `npm test`: 493 pasan, 2 saltadas. |
| CA15 | NO VERIFICADO | Esta vuelta no corrí `npm ls ical.js` ni `npm audit signatures`. |

**Reporte aparte, sin reintentos que lo tapen:** F-005 CA27 (intermitente conocido) y F-008 CA4, un presupuesto de tiempo que falló con carga y pasó solo. Esa segunda falla no estaba en tu lista de conocidos.

**Pruebas:** `tests/acceptance/F-014/` (6 archivos, 65 pruebas, 2 nuevas del CA3). Con `tsc --noEmit -p tests/acceptance` y `eslint tests/acceptance` quedan 0 errores (84 advertencias). Las corregí para dejar eso: tipos y retornos `any` en `integration.test.ts` y `data.test.ts`.

**Pruebas corregidas por contradecir la ficha:** `http.test.ts`, «estado 500». Exigía que `requestText` devolviera `{status: 500}`, pero la ficha no dice si debe devolverlo o rechazar. El código rechaza con `code: "status"`, igual que `request`. Ahora acepta cualquiera de las dos salidas. **Pregunta para el arquitecto:** ¿`requestText` debe rechazar con `status` o devolver el estado? CA6 pasa con cualquiera de las dos.

**check-scope verificador:** ✅

