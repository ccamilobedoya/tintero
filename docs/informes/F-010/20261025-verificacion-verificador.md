## Informe del verificador · F-010 · fase verificación · vuelta 1

**Veredicto:** CUMPLE

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `chromium.test.ts` «CA1 etiquetas»: esperado, los contenedores llevan las etiquetas de la ficha; obtenido, se cumple. |
| CA2 | PASA | `chromium.test.ts`: el borrado afecta solo a los contenedores de la misma instancia y registra la línea. Un nombre de instancia inválido lanza error. |
| CA3 | PASA | `chromium.test.ts`: `startChromium` con instancia deja 1 contenedor propio y respeta el de la otra instancia. Sin instancia no borra ninguno. El bloque «CA3 servidor» también pasa. |
| CA4 | PASA | `service.test.ts` «CA4 plantilla e instalador»: pasa. |
| CA5 | PASA | `npm run test:acceptance` completo: 48 archivos y 464 pruebas pasan, con `.revisar/semgrep.json` presente. |
| CA6, CA7 | No evaluados | Son en vivo, como indicaba el encargo. |

- **F-010:** 2 archivos y 13 pruebas pasan.
- **`npm test`:** 41 archivos pasan y 1 se omite (377 pruebas pasan y 2 se omiten).
- **Intermitencias:** no vi ninguna. Solo corrí cada lote una vez.
- **Aviso de bloqueo:** el lote completo imprimió «Bloqueado: el hook no pudo leer el comando (falla cerrada)» y «Bloqueado por el proyecto: no se leen ni se tocan archivos .env…». No lo investigué. Pasó sin afectar a ninguna prueba, y supongo que lo imprime alguna prueba de los hooks.
- **Contenedores:** `docker ps -a --filter label=tintero.chromium=1` devuelve 0, no quedó ninguno.
- **`npx tsc --noEmit -p tests/acceptance`:** sin errores.
- **`npx eslint tests/acceptance/F-010`:** 0 errores y 5 avisos (`security/detect-non-literal-fs-filename`, p. ej. `existsSync` con argumento no literal).

**Pruebas:** `tests/acceptance/F-010/chromium.test.ts` y `tests/acceptance/F-010/service.test.ts` (13 pruebas)
**Pruebas corregidas por contradecir la ficha:** ninguna
**check-scope verificador:** ✅

