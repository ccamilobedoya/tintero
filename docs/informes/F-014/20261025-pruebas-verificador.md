## Informe del verificador · F-014 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **PRUEBAS LISTAS**. Ningún CA es NO VERIFICABLE. Hay dos avisos abajo, uno sobre el fixture y otro sobre el nombre del cargador.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `data.test.ts`: `gato` falla en `/sources/calendario/items/0/icon`, `Mi Cal` en `…/calendar`, los 6 iconos pasan, `setSource` devuelve `ok:false` |
| CA2 | PRUEBA ESCRITA | `data.test.ts`: los 11 `start` en orden, títulos y `end`, ids con `sha12(UID\|start)`, estables entre lecturas |
| CA3 | PRUEBA ESCRITA | `data.test.ts`: títulos de 200 y `(sin título)`, `too-many` con basura tras la línea 20 001, 20 000 pasa, diario con ventana de 10 años da ≤2000 y `truncated>0`, `bad-ical`, presupuesto de 3 s |
| CA4 | PRUEBA ESCRITA | `data.test.ts`: 300+300 da 500, `dropped` 100, quedan los días 0 a 249 y salen ordenados; también el caso de los eventos que cubren hoy |
| CA5 | PRUEBA ESCRITA | `calendars-file.test.ts`: pruebas por el CLI de `main.ts` (644, 11, `/1/id`, http://, campo de más, `webcal://` arranca) y por `loadIntegrations` (la entrada `ical-calendario`) |
| CA6 | PRUEBA ESCRITA | `integration.test.ts`: dos GET, 13 eventos ordenados con su icono; con 500 en `trabajo` se conservan los 11, `readAt` es la de `trabajo` y se registra `error` de `trabajo` |
| CA7 | PRUEBA ESCRITA | `integration.test.ts`: 8 MiB+1 da `too-large`, el 302 no se sigue, `too-many` y `bad-ical` en el registro, y la búsqueda de ruta y SUMMARY en todo lo registrado |
| CA8 | PRUEBA ESCRITA | `integration.test.ts`: modo 600, sin ruta en el archivo, `start()` entrega antes de cualquier GET, calendario ausente no se entrega, archivo dañado o de más de 4 MiB se ignora |
| CA9 | PRUEBA ESCRITA | `http.test.ts`: texto tal cual, `route`, `requestText.length===1`, `too-large`, redirección, registro sin ruta; `request` sigue igual |
| CA10 a CA12 | PRUEBA ESCRITA | `draw.test.ts`: motor real, zonas y todos los píxeles de la ficha; el nombre del festivo se busca en el HTML de la página entera |
| CA13 | PRUEBA ESCRITA | `previous.test.ts`: `render` sobre el commit `1cd6756` (`git archive` a una carpeta temporal) contra el árbol actual, P124 y V124, imágenes iguales |
| CA14 | PRUEBA ESCRITA | `previous.test.ts`: F-005, F-006, F-008, F-009 y las cuatro pruebas de F-013 salvo `previous` (evita correr el lote dos veces) |
| CA15 | PRUEBA ESCRITA | `previous.test.ts`: `package.json` tiene `"2.2.1"` exacta, `npm ls` y `npm audit signatures` |

**Avisos para el arquitecto:**
- **Fixture sin CRLF en disco.** El entorno me bloqueó convertir y escribir con CRLF. `fixtures/prueba.ics` quedó con LF, idéntico al texto de la ficha. `pruebaIcs()` lo normaliza a CRLF al leerlo, así que las pruebas usan CRLF. Conviene convertirlo antes del commit (`sed -i 's/$/\r/'`).
- **Cargador del archivo de calendarios sin nombre en el contrato.** Lo probé por el CLI (código 2, mensaje en la salida) y por `loadIntegrations`. Asumí que el CLI imprime `calendars: /0/url: must be https:// or webcal://` y `key-permissions`.
- **Colisión con la fixture de CA11 y CA12.** El nombre del festivo se busca en el HTML de toda la página. Si `month-calendar` lo mostrara, CA12 fallaría por ese motivo y no por la agenda.

**Pruebas:** `tests/acceptance/F-014/` — 7 archivos (`data`, `integration`, `http`, `calendars-file`, `draw`, `previous`, `helpers`), unas 45 pruebas, más la fixture. No cubren `pollS: 240` (el manifiesto no tiene nombre exportado) ni el máximo de 15 peticiones por hora.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**Compilación:**
- `tsc` y `eslint` solo fallan por lo que falta: `ical-calendar.ts` y `requestText` no existen todavía, y sus `any` en cascada (`no-unsafe-call`, `no-unsafe-return`, `TS7006`).
- `integration.test.ts` línea 93 tiene un aviso `no-unnecessary-type-assertion` (`as never`) que habrá que revisar en la verificación.
- `prettier` está limpio.

**check-scope verificador (`--base ficha/F-014`):** ✅

