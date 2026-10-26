## Informe del verificador · F-018 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **PRUEBAS LISTAS**, con CA21 solo parcial (ver abajo). Las pruebas están sin correr contra código nuevo: la única comprobación fue que fallan ahora y que las trampas de falso positivo no pasan solas.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA0, CA12a, CA12b, CA17, CA20 | NO ES DE PRUEBA | Los comprueba el arquitecto o el dueño a mano, como pediste. |
| CA1 | PRUEBA ESCRITA | `legal.test.ts`: LICENSE igual línea por línea al MIT de la SPDX, `package.json`, y NOTICE con cada licencia (R2 incluido). |
| CA2 | PRUEBA ESCRITA | `legal.test.ts`: recorre `npm ls --omit=dev --all --json` y lee `license` en `node_modules`. No encuentra GPL, AGPL, LGPL, SSPL ni paquetes sin licencia. |
| CA3 | PRUEBA ESCRITA | `legal.test.ts`: los cuatro archivos existen, los EN no tienen palabras en español, enlazan a su `.es.md` y traen las secciones de R3 y R4. |
| CA4 | PRUEBA ESCRITA | `controls.test.ts`: copia con hooks puestos. 13 rutas, entre ellas `secrets.h`, `x.key`, `devices.txt`, `state.json` y `.env.local`, dan salida 1 con la ruta en el mensaje y sin commit nuevo. `x.example.pem` y `.env.example` pasan. Con `never-commit.txt` borrado se bloquea todo. |
| CA5 | PRUEBA ESCRITA | `controls.test.ts`: `--tree` sobre `main` da 0. Los 8 valores dan 1, con archivo y línea 3 y sin el valor. Los 4 permitidos dan 0. También cubre `--json`, el uso erróneo (salida 2) y la falla cerrada. |
| CA6 | PRUEBA ESCRITA | `controls.test.ts`: PNG con `tEXt`, `iTXt`, `zTXt` y `eXIf`, y un JPEG con EXIF, dan 1. El PNG limpio da 0. Todo PNG de `docs/` se revisa sin esos bloques. |
| CA7 | PRUEBA ESCRITA | `controls.test.ts`: `--history` sobre `main` da 0 en menos de 60 s. |
| CA8 | PRUEBA ESCRITA | `i18n.test.ts`: imagen `raw1` de `hoy` dibujada con el código de `main` y grabada en `fixtures/hoy-main-P124.raw1`. Con `locale` ausente es idéntica byte a byte (pasa hoy, con Chromium real). Con `"es"` falla hoy porque el campo no existe. |
| CA9 | PRUEBA ESCRITA | `i18n.test.ts`: `OCTOBER 2026`, `HOLIDAY MON 2 NOV`, `HOLIDAY TODAY`, las listas vacías de `tablero`, `All day`, los avisos `no data since …` y ningún texto `es`. Una prueba de control confirma que los mismos casos sí existen en español. |
| CA10 y R10b | PRUEBA ESCRITA | `i18n.test.ts`: `"fr"` da `ConfigError` en `locale`, `es` y `en` se aceptan, los catálogos tienen las mismas claves y `en` trae los valores de R10b. |
| CA10b y R10c | PRUEBA ESCRITA | `i18n.test.ts`: los ejemplos en inglés se validan y el HTML no trae ninguno de los 9 textos prohibidos. |
| CA11 | PRUEBA ESCRITA | `firmware.test.ts`: `public-scan --tree` y `private-terms --tree` en una copia que solo conserva `firmware/` y `tools/`. Sin `setInsecure` ni `TINTERO_HOST = "…"` con valor. También R11 a R14: `setCACert`, tiempos de espera y límites, README con la advertencia de la flash y cómo revocar. |
| CA13 | PRUEBA ESCRITA | `pki-firmware.test.ts`: modo 600, las constantes, los PEM iguales a sus archivos, nada de p2, nada de `PRIVATE KEY` en la salida, reemplazo atómico y vía `npm run pki`. |
| CA14 | PRUEBA ESCRITA | `pki-firmware.test.ts`: sin `--host`, DNS inválidos, sin pantalla, `p1 p2`, `p9`, y PEM de 5 000 bytes en `p1.crt`, `p1.key` y `ca.crt`. Todos salen 2 y dejan la carpeta de destino vacía. |
| CA15 | PRUEBA ESCRITA | `pki-firmware.test.ts`: en una copia, `docs/c.h` (absoluta y relativa) y `firmware/include/other.h` dan 2. `tintero_certs.h` y la ruta por defecto escriben con modo 600. |
| CA16 | PRUEBA ESCRITA | `pki-firmware.test.ts`: `runWake` con los PEM leídos del encabezado generado. Exige `errors` vacío, `current`, el índice 200 y la imagen de `current` 200. |
| CA18 | PRUEBA ESCRITA | `docs.test.ts`: pares `en`↔`es` con los mismos `##`, enlaces relativos de `README.md`, `README.es.md` y `docs/guide/`, R18 a R20 y el contenido de cada guía. |
| CA19 | PRUEBA ESCRITA | `docs.test.ts`: `tools/imagenes-guia` dos veces en una copia da los mismos SHA-256, y son los mismos que los del repo. |
| CA21 | **PARCIAL / NO VERIFICABLE** | Escrito: `http:` fuera de loopback da `ConfigError` en `/integrations/example-json/baseUrl`, el manifiesto (R22) y 64 KiB + 1 byte y la redirección contra el cliente con guardia. **No verificable:** el módulo que lee el JSON y el campo de tipo incorrecto. Pregunta: ¿qué exporta `example-json.ts` (fábrica, límites, parser), qué forma tiene el JSON público (campos y tipos) y a qué fuente del motor entrega? |
| CA22 | PRUEBA ESCRITA (parcial) | No hay prueba recursiva de `npm run test:acceptance`: lo comprueba la corrida de la fase de verificación. Escrito: R8 (`tools/revisar` corre `public-scan`) y que los scripts de `package.json` siguen. |

**Pruebas:** `tests/acceptance/F-018/` (`helpers`, `legal`, `controls`, `i18n`, `firmware`, `pki-firmware`, `example-json`, `docs` y `fixtures/hoy-main-P124.raw1`), unas 150 pruebas. Hoy pasan 6: CA8 con `locale` ausente, el lector de encabezados, el control de `es` y la validación de `package.json`. Las demás fallan porque falta el código.

**Para el arquitecto:**
- **Allow-list:** no hace falta ninguna excepción en `tools/public-scan-allow.txt`. Los valores de CA5 se arman por partes en el código, así que el archivo no los trae completos.
- **Supuestos que pueden hacer fallar sin que haya defecto:**
  - El hook debe imprimir la ruta del archivo bloqueado.
  - `public-scan` debe poner la ruta y la línea en la misma línea de salida.
  - El `NOTICE` debe poner nombre y licencia a menos de 3 líneas.
- **Dependencias del entorno:** las pruebas de commit y las de `tools/imagenes-guia` necesitan Docker y la lista de términos privados de esta máquina.

**Pruebas corregidas por contradecir la ficha:** ninguna.
**Comprobaciones:** `npx tsc --noEmit -p tests/acceptance`, `npm run typecheck`, `eslint --max-warnings 0` y `prettier --check` limpios.
**check-scope verificador:** ✅ (no dejé archivos temporales).
