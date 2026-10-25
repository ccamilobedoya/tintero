## Informe del verificador · F-009 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **PRUEBAS LISTAS**. Ningún CA se marca NO VERIFICABLE.

Las pruebas todavía no corren. `tsc -p tests/acceptance` solo da TS2307 (módulos de `server/src/integrations/` que aún no existen). ESLint solo da los errores `no-unsafe-*` que vienen de esos módulos sin resolver; deberían desaparecer cuando exista el código.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `http.test.ts`: 3 bases malas → `host`; 6 rutas malas → `bad-path`/`route`; 0 peticiones y 0 líneas de registro. Control: una base buena se crea. |
| CA2 | PRUEBA ESCRITA | `http.test.ts`: llave 0644 y 0640 → `key-permissions`; inexistente → `key-missing`; 4097 B → `key-too-large`; `"\n  \n"` → `key-empty`. Ningún mensaje lleva el token. 4096 B caben, la llave se lee una sola vez. `Authorization` exacto en cada petición; el objeto no contiene el token. |
| CA3 | PRUEBA ESCRITA | `http.test.ts`: `too-large` con y sin Content-Length, `timeout` en menos de 1000 ms, `network`, 401, `bad-json`. Cada caso deja una línea con las claves, el `ts` del reloj y el `host` esperados. También `maxBytes` bajo y cuerpo vacío → `null`. |
| CA4 | PRUEBA ESCRITA | `http.test.ts`: `writes:false`, `allowWrite:false` y ausente → `write-denied` con 0 peticiones. Control: con ambos permisos el PATCH sale. |
| CA5 | PRUEBA ESCRITA | `board.test.ts`: 2 GET con los parámetros de la tabla, 4 tareas en orden con `toStrictEqual`, `statuses`, y 5 líneas `skipped` sin ids. Con las columnas alternas entra `tarjeta00004` y sale `tarjeta00002`. Además, una respuesta sin la forma esperada → `bad-json`. |
| CA6 | PRUEBA ESCRITA | `board.test.ts`: `written` con GET y luego PATCH `{"value":"Hecho"}` exacto. `conflict` sin PATCH si Trilium cambió. `tarjeta00006` (solo heredada) y `tarjeta99999` → `conflict`, sin ningún PATCH y sin tocar `atrplantilla`. |
| CA7 | PRUEBA ESCRITA | `flow.test.ts`: espía `[]` con `readAt` y luego las 4 tareas; toggle → PATCH `Hecho`; segundo toggle → PATCH `Por hacer`. Con el falso lento: ≤ 2 PATCH, termina en `Por hacer` y el ciclo siguiente entrega `todo`. Añadidas: `unknown-task` y fuente ajena ignorada. |
| CA8 | PRUEBA ESCRITA | `flow.test.ts`: tras cambiar a `En progreso` en Trilium, 0 PATCH, línea `conflict` y el ciclo siguiente entrega `doing`. |
| CA9 | PRUEBA ESCRITA | `flow.test.ts`: `pending`; el ciclo de las 17:02 no llama al espía; a las 17:03 el orden es GET tarjeta, PATCH, y luego las dos GET de lectura, con `written` y `done`. Caso de 24 h: `expired`, 0 PATCH y `todo`. |
| CA10 | PRUEBA ESCRITA | `flow.test.ts`: `readAt` por ciclo (17:00, luego 17:03, con 17:00 intacto tras el fallo de las 17:02). Sin conexión desde el arranque, la única llamada es `([], 17:00Z)` y `staleLabel` da «sin datos desde 12:00». |
| CA11 | PRUEBA ESCRITA | `config.test.ts`: 6 errores de `loadIntegrations` con la ruta JSON y sin el valor; control con config buena; `config/integrations.example.json` carga. Servidor (`runNpm`): sin `--views`/`--data`, `source` inexistente, `allowWrite`/`readonly` desacordes en ambos sentidos y llave 0644 salen con 2. |
| CA12 | PRUEBA ESCRITA | Último `it` de `http.test.ts`, `board.test.ts` y `flow.test.ts`: ninguna línea contiene títulos, ids, `tablero00001` ni el token; las líneas de llamada tienen exactamente `ts, integration, host, method, status, ms`. |
| CA13 | PRUEBA ESCRITA | Cubierto por `npm run test:acceptance` completo y `npm test` en la fase de verificación. |

**Supuestos que el arquitecto debe confirmar** (no impiden las pruebas):
- **`columns` en `cfg`:** la ficha dice «columnas por defecto», pero el tipo lo declara obligatorio. Las pruebas pasan `columns: COLUMNS` (el valor por defecto) a `createTriliumTasks`. Si la integración debe aceptar `columns` ausente en la config, decídanlo y ajusto.
- **Líneas `skipped`:** no llevan ids, así que CA5 compara la cuenta por `reason` (2 `no-status`, 1 `unknown-status`, 1 `old-done`, 1 `archived`), no tarjeta por tarjeta.
- **Mensajes de salida 2 en CA11:** pido que contengan la ruta JSON (`/integrations/trilium-tareas/source`, `/allowWrite`) o `key-permissions`, para que un 2 por otro motivo (p. ej. Chromium) no pase por bueno. Si el servidor arranca Chromium antes de validar `--integrations`, esas pruebas necesitan Docker y tardarán.

**Pruebas:** `tests/acceptance/F-009/{etapi,helpers}.ts` (ETAPI falso y utilidades) y `{http,board,flow,config}.test.ts` (unas 40 pruebas). La llave va en una carpeta temporal fuera del repo, que se borra al terminar.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**check-scope verificador:** ✅

