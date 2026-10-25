**Informe del verificador · F-010 · fase pruebas · vuelta 2**

**Veredicto:** PRUEBAS LISTAS

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `chromiumDockerArgs` con `"prueba-a"` lleva las dos etiquetas antes de la imagen. Sin instancia lleva solo `tintero.chromium=1`. Con `"Prueba A"` lanza. |
| CA2 | PRUEBA ESCRITA | Con Docker real: dos contenedores de A, uno de B y uno sin etiquetas, con instancias únicas por corrida. `removeOrphanChromium(A, {log})` devuelve 2 y deja corriendo el de B y el sin etiquetas. Hay una línea de registro con `count: 2`. Otra llamada devuelve 0 y no registra. `"Mal Nombre"` lanza. |
| CA3 | PRUEBA ESCRITA | `startChromium({instance: A})` deja exactamente 1 contenedor de A (el nuevo) y el de B sigue corriendo. `startChromium()` sin instancia no borra ninguno. El servidor con `--instance "Mal Nombre"` sale con 2 (se le pasan los ejemplos de F-006, para que el 2 no venga de otro argumento). |
| CA4 | PRUEBA ESCRITA | Sin cambios de la vuelta 1: `service.test.ts`. |
| CA5 | PRUEBA ESCRITA | Es la suite de F-001 a F-009; se corre en la fase verificación. |
| CA6 | NO VERIFICABLE | En vivo, lo corre el arquitecto, no hay prueba. |
| CA7 | NO VERIFICABLE | En vivo, lo corre el dueño, no hay prueba. |

**Estado de las comprobaciones:**
- `npm run typecheck` pasa.
- `npx tsc --noEmit -p tests/acceptance` da 6 errores, todos porque falta `removeOrphanChromium`, el quinto argumento de `chromiumDockerArgs` y la opción `instance`. Se esperan hasta que exista el código.
- `npx eslint tests/acceptance/F-010` da 6 errores, también por esas importaciones sin resolver. Los 5 avisos de `security/detect-non-literal-fs-filename` no cambiaron desde la vuelta 1. No volví a correr eslint cuando exista el código.

**Pruebas:** `tests/acceptance/F-010/` (`chromium.test.ts`: 8 pruebas; `service.test.ts`: 5; `helpers.ts` ajustado a instancias)
**Pruebas corregidas por contradecir la ficha:** ninguna. Quité el chequeo de precondición que fallaba si ya había contenedores con `tintero.chromium=1`.
**check-scope verificador:** ✅

