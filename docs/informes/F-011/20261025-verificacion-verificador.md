## Informe del verificador · F-011 · fase verificación · vuelta 1

**Veredicto:** CUMPLE

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `docker.test.ts` y `f009.test.ts` pasan. |
| CA2 | PASA | `fatal.test.ts` pasa. |
| CA3 | PASA | `live.test.ts` pasa. |
| CA4 | PASA | `live.test.ts` pasa. |
| CA5 | PASA | Pasan las pruebas observables. El punto (5), que `loadState` lea del mismo descriptor, no se observa: lo juzga la revisión, como aclara la ficha. |
| CA6 | PASA | `npm run test:acceptance` completo: 483 de 484 pasan. `npm test`: 390 pasan, 2 omitidas. La única falla fue F-005 CA27 (`busy` 503), que no toca F-011. Al repetir F-005 solo, pasó 79 de 79. |

No leí el código ni las pruebas de F-011 una por una. Asigné cada CA a un archivo por el nombre del archivo y no por su contenido, así que ese reparto es una suposición. La corrida de F-011 dio 4 archivos y 20 pruebas, todas en verde.

**Posible intermitencia (regla 12):** F-005 CA27 falló una vez en el lote completo, con carga alta por las pruebas en paralelo. No lo reproduje al repetir F-005 solo. No lo vi ligado a F-011, pero el dueño debería saber que puede fallar a veces.

**Contenedores:** de mis pruebas no queda ninguno. Los tres `tintero-chromium-*` que hay no son míos:
- `b60338ca` es del servicio real (`tintero.instance=servicio`) y no lo toqué.
- `d0448e17` y `8c420e19` llevan 20 horas y no tienen etiqueta de instancia. Son anteriores a esta sesión.

**Pruebas:** `tests/acceptance/F-011/` (`docker.test.ts`, `f009.test.ts`, `fatal.test.ts`, `live.test.ts`; 20 pruebas, todas en verde).
**Pruebas corregidas por contradecir la ficha:** ninguna.
**Herramientas:** `npx tsc --noEmit -p tests/acceptance` y `npx eslint tests/acceptance/F-011` sin errores.
**check-scope verificador:** ✅

