## Informe del revisor · F-013 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (2)

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Lo que juzgué** (revisé el código y los diffs; no ejecuté las pruebas, solo vi que `tools/revisar` las dio por buenas)
- **`needsKey` (`http.ts:123-128`):** con `needsKey: true` y `keyFile` undefined se lanza `key-missing` antes de crear el cliente. Así no puede salir una petición sin llave. `trilium-tareas` sigue con `needsKey: true` y `main.ts:113` le pasa su llave.
- **`festivos` no manda `Authorization`:** no lee ninguna llave. `main.ts:128` pasa `undefined` y el manifiesto tiene `needsKey: false`. Con `token` undefined las cabeceras salen vacías (`http.ts:181`).
- **Host y ruta:** `hosts: "configured"` y solo `GET /api/v3/PublicHolidays/`. `parseHolidays` valida `baseUrl` con `parseBase` (https, o http a 127.0.0.1). El país se valida con `^[A-Z]{2}$`. Solo salen el año y el país.
- **Topes de tamaño antes de parsear:**
  - La respuesta de Nager.Date se limita a 64 KiB en `guardedHttp` (`maxBytes` por `Content-Length` y al leer) antes del `JSON.parse`.
  - `stateFile` se lee con `readCapped` a 64 KiB. Un archivo roto o ajeno da un caché vacío, sin lanzar error.
  - El caché se cuida de no pasar su propio tope al guardarse.
  - `--holidays` usa `readCapped` a 64 KiB. Cualquier fallo termina con código 2 y un mensaje sin contenido.
  - Máximo 400 elementos y 60 caracteres por nombre en todas las rutas, incluida `engine.setHolidays`.
- **Registros:** solo llevan `year`, `status`, `items` (cuenta) y `code`. El registro por llamada de `http.ts` no incluye contenido. Ningún registro lleva nombres de festivos.
- **Nombres de festivos en el dibujo:** el nombre no llega al HTML. La etiqueta solo muestra «FESTIVO» y la fecha.
- **Caché atómico:** archivo temporal con permisos 600, fsync y rename. Un fallo de escritura se registra con un código y el servidor sigue.
- **Embebido y rendimiento:** timeout de 5 s, reintento a la hora tras un error, 24 h tras un 404, una lectura por país y año válida 30 días, y nunca bloquea el arranque ni el dibujo. Las lecturas van en cola, una a la vez. `stop()` cancela el temporizador y espera.
- **Dependencias:** ninguna nueva. **Herramientas y configuración:** no se tocaron `tools/`, `eslint.config.js`, `.npmrc` ni `.gitleaks.toml`.

**Mejoras** (se anotan en la ficha)
- `holidays-nager.ts`: `persist()` no guarda si el caché supera 64 KiB y no deja registro. Es silencioso y casi imposible con 8 años y 400 elementos como máximo. Conviene registrar `code: "state-size"`.
- `main.ts`: el aviso «festivos integration is off» puede duplicarse cuando `integrations` falta y también cuando falta la entrada `festivos`. Los dos casos son excluyentes en el código actual, así que hoy no se repite, pero la lógica está repartida y se podría juntar en un solo lugar.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- Ninguna nueva. Los avisos de eslint en `tests/acceptance/F-00x` son viejos y conocidos, no de esta ficha.
