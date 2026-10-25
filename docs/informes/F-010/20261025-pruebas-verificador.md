## Informe del verificador · F-010 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → PRUEBAS LISTAS

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `chromiumDockerArgs(...)` debe tener `--label` seguido de `tintero.chromium=1`, y los dos antes de la imagen. Falla hasta que exista el código. |
| CA2 | PRUEBA ESCRITA | Docker real con la imagen fijada: 2 contenedores etiquetados y 1 sin etiqueta. Espera que devuelva 2, que los etiquetados desaparezcan, que el otro siga corriendo y una línea `{event:"chromium",action:"orphans",count:2}` con `ts`. Otra prueba: sin etiquetados devuelve 0 y no registra nada. |
| CA3 | PRUEBA ESCRITA | Con un contenedor etiquetado corriendo, `startChromium()` deja exactamente 1 con la etiqueta, y su nombre es el que devuelve `startChromium`. Además, el anterior ya no corre. |
| CA4 | PRUEBA ESCRITA, **5 pruebas pasan ya** | `--dry-run` con el archivo de prueba imprime las 6 líneas exigidas, sin marcadores `@…@`. No crea la unidad, ni en `HOME` de prueba ni en el real. Sin `TINTERO_DIR` sale con 2 y lo nombra. Un `\r` dentro de un valor sale con 2. Una línea extra no inyecta directivas. |
| CA5 | PRUEBA ESCRITA (no es un archivo nuevo) | Se comprueba con `npm run test:acceptance` en la fase de verificación. |
| CA6 y CA7 | Sin prueba automática | Son en vivo, como indicaba el encargo. |

**Notas:**
- **Qué no pude comprobar:** no corrí `chromium.test.ts`, porque `removeOrphanChromium` aún no existe. Sus pruebas con Docker real no se han ejecutado.
- **Cómo limpian:** cada contenedor lleva el nombre `tintero-f010-test-<hex>` y se borra en `afterEach`, pase lo que pase.
- **Etiquetados ajenos:** si ya hay contenedores con la etiqueta `tintero.chromium=1`, las pruebas de Docker fallan de entrada. Así no borran los de otro.
- **Salto de línea (CA4):** el instalador separa por `\n`, así que un valor no puede contener un `\n` real. Probé el caso equivalente (`\r` en medio) y que una línea extra no se cuela en la unidad. Si el arquitecto entendía otra cosa por «valor con salto de línea», dígamelo.

**Comprobaciones:**
- `npm run typecheck`: limpio.
- `npx tsc --noEmit -p tests/acceptance`: 3 errores, todos por el export que falta (`removeOrphanChromium`) y los tipos `any` que arrastra. Se resuelven cuando el programador lo cree.
- `npx eslint tests/acceptance/F-010`: tiene los mismos errores derivados de ese export. También avisa 5 veces de `security/detect-non-literal-fs-filename`, que son avisos y no errores (rutas armadas por la prueba).

**Pruebas:** `tests/acceptance/F-010/{helpers,chromium.test,service.test}.ts` (9 pruebas: 1 de CA1, 3 de CA2 y CA3, 5 de CA4)
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅

