## Informe del verificador · F-018 · fase verificación · vuelta 2 (correcciones a mis pruebas)

**Veredicto:** fase verificación → NO CUMPLE, solo por las iniciales del calendario (código). Todo lo demás de estos cinco archivos pasa.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA21 | PASA | Las configuraciones llevan `source: "tareas"` y las rutas usan `EXAMPLE_JSON_PATH`. Tras eso pasan `http:` → ConfigError que nombra `baseUrl`, 64 KiB exactos se leen, 64 KiB + 1 byte da `too-large` y la redirección no se sigue. Prueba nueva: `done:"no"`, `title` numérico, `due` inválido, `id` repetido y una respuesta que no es lista dan `bad-json` en `parseExampleTasks`. Con `createExampleJson` y un motor falso, `setSource` no se llama en ningún caso. Una respuesta buena sí lo llama una vez. |
| CA13 | PASA | La comparación usa los últimos 40 caracteres del cuerpo base64 de la llave y del certificado de p2, y de la llave de p1 en la salida. La cabecera ASN.1 ya no cuenta. |
| CA9 | FALLA (código) | Los títulos de las vistas ahora son `Today view`, `Board view`, etc. Siguen fallando 3 pruebas por `['L','J','V','D']`: el calendario del mes dibuja las iniciales en español con `en`. |
| CA10b | FALLA (código) | Mismo motivo: `['L','J','V','D']`. |
| CA11 | PASA | Pasa con el escáner corregido. Antes fallaba por mi `cloneRepo`; ver abajo. |

**Pruebas:** `tests/acceptance/F-018/` (5 archivos corridos: 114 pruebas, 110 pasan y 4 fallan, las de las iniciales).
**Pruebas corregidas por contradecir la ficha:** las de CA21 (ruta, `source`), CA13 (comparación de la llave), CA9 (títulos).
**Corrección extra:** el `node_modules` que `cloneRepo` enlazaba como symlink no lo ignora `.gitignore`, porque `node_modules/` no coincide con un symlink. `private-terms.ts --tree` lo listaba y fallaba con `EISDIR`. Lo agregué a `.git/info/exclude` de la copia, en `helpers.ts`.
**tsc, eslint (0 errores; warnings preexistentes) y prettier:** limpios.
**check-scope verificador:** ✅
