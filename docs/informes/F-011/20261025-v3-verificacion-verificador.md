## Informe del verificador · F-011 · fase verificación · vuelta 3

**Veredicto:** CUMPLE

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | Carpeta F-011: 23 de 23 pruebas pasan. |
| CA2 | PASA | Igual. |
| CA3 | PASA | Igual. |
| CA4 | PASA | Igual. |
| CA5 | PASA | Igual. |
| CA6 | PASA | Igual. |
| CA9 | PASA | `vuelta2.test.ts` pasó 3 de 3 en 3 corridas seguidas (3/3, 3/3, 3/3). No hubo fallos intermitentes. Cada corrida tarda unos 121 s. |
| CA10 | PASA | Carpeta F-011: 23 de 23 pruebas pasan. |

**Otras corridas:**
- Lote completo de aceptación: 53 archivos y 487 pruebas pasan.
- `npm test`: 392 pasan y 2 se omiten, sin fallos.
- La salida de las corridas incluye una línea "No such container: <id>", que no hace fallar ninguna prueba. Es probable que la emitan las pruebas al limpiar un contenedor que ya no existe. No lo comprobé.

**Contenedores y servicio real:**
- `docker ps -a` no muestra contenedores de mis pruebas, ni pausados ni parados.
- Hay tres `tintero-chromium-*` en ejecución (de 47 min, 21 h y 21 h). Por su antigüedad no son de mis corridas, que duraron unos 10 min en total. No los toqué ni el servicio real.

**Herramientas:**
- `npx tsc --noEmit -p tests/acceptance` no da errores.
- `npx eslint tests/acceptance/F-011` da 0 errores y 1 aviso, `security/detect-object-injection` en `vuelta2.test.ts:196`. Es un aviso que ya existía, no un error.

**Pruebas:** `tests/acceptance/F-011/…` (5 archivos, 23 pruebas)
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅

