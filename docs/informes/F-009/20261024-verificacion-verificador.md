## Informe del verificador · F-009 · fase verificación · vuelta 1

**Veredicto:** fase verificación → CUMPLE

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `http.test.ts` «CA1 origen y rutas» (3 pruebas): una base no permitida se rechaza con el host y sin tocar la red. Las rutas y métodos fuera del manifiesto se rechazan sin llamar. |
| CA2 | PASA | `http.test.ts` «CA2 llave» (4 pruebas): permisos 644 y 640 dan `key-permissions`, y también `key-missing`, `key-too-large` y `key-empty`. 4096 bytes exactos caben. El token va exacto en cada petición y no queda en el objeto. La llave se lee una sola vez. |
| CA3 | PASA | `http.test.ts` «CA3 topes» (7 pruebas): 1 048 577 bytes dan `too-large` con y sin Content-Length. `maxBytes` baja el tope. Un falso lento da `timeout` antes de 1000 ms. Sin conexión da `network`. 401 da `status`, `{` da `bad-json` y el cuerpo vacío da json null. |
| CA4 | PASA | `http.test.ts` «CA4» (2 pruebas): sin `writes` o sin `allowWrite` da `write-denied` y 0 peticiones. Con ambos permisos el PATCH sale. |
| CA5 | PASA | `board.test.ts` «CA5 lectura» (3 pruebas): 2 peticiones y 4 tareas en el orden del tablero. Cada `skipped` se cuenta por `reason`. Con otras columnas, `tarjeta00004` entra como doing y `tarjeta00002` no. Una respuesta mal formada da `bad-json`. |
| CA6 | PASA | `board.test.ts` «CA6» (4 pruebas): `written` hace GET y luego el PATCH exacto. Si Trilium cambió el status da `conflict` y ningún PATCH. Con solo el atributo heredado, o con la nota inexistente, da `conflict` y nunca se parchea `atrplantilla`. Los demás errores se lanzan. |
| CA7 | PASA | `flow.test.ts` «CA7» (4 pruebas): de punta a punta, primero `[]` con `readAt` y luego las 4 tareas. El toggle da Hecho y el segundo toggle da Por hacer. Con el falso lento hay como máximo 2 PATCH y termina en Por hacer. Las tareas desconocidas y las fuentes ajenas no escriben. |
| CA8 | PASA | `flow.test.ts` «CA8»: si cambió en Trilium no se pisa, y el siguiente ciclo trae lo de Trilium. |
| CA9 | PASA | `flow.test.ts` «CA9» (2 pruebas): sin conexión queda pendiente y sin llamadas al espía, y al volver se escribe antes de leer. Pasadas 24 h el pendiente caduca sin escribir. |
| CA10 | PASA | `flow.test.ts` «CA10» (2 pruebas): `readAt` es el reloj de cada ciclo y un fallo no lo cambia. Sin conexión desde el arranque queda `([], readAt 17:00Z)` con «sin datos desde 12:00». |
| CA11 | PASA | `config.test.ts` (15 pruebas): la configuración buena carga. Un archivo de 65 537 bytes, un campo desconocido, `columns` mal formadas, un `baseUrl` ajeno y un `boardNoteId` malo dan error con la ruta JSON y sin el valor. `integrations.example.json` carga. El servidor sale con 2 en estos casos: faltan `--views`/`--data`, `source` inexistente, `allowWrite` no coincide con `readonly` (en los dos sentidos, D15) y llave en 0644 (`key-permissions`, sin token). |
| CA12 | PASA | Pruebas de registros en `http.test.ts`, `board.test.ts` y `flow.test.ts`: ninguna línea lleva contenido, ids ni token. |
| CA13 | PASA | `npm run test:acceptance` completo: 44 archivos y 429 pruebas pasan. `npm test`: 39 archivos pasan y 1 se salta (351 pruebas pasan, 2 se saltan). |

**Pruebas:** `tests/acceptance/F-009/…` (`http`, `board`, `flow` y `config`; 49 pruebas, todas pasan).
**Correcciones de lint (sin debilitar ninguna prueba):** `helpers.ts` ahora usa `ref.tt` y ya no tiene el `let` ni los casts innecesarios. `http.test.ts` tiene `it` sin `async`, la comprobación de `JSON.stringify` mediante un tipo `string | undefined` y un guard en lugar del `as Line`. Quité los `eslint-disable` que ya no se usaban.
**Hallazgos:** ninguna prueba falló a veces en las corridas. En `eslint tests/acceptance/F-009` queda 1 aviso (no error): `security/detect-object-injection` en `http.test.ts:118`. `tsc --noEmit -p tests/acceptance` pasa sin errores.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**check-scope verificador:** ✅

