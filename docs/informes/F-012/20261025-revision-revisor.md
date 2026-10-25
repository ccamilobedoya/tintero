## Informe del revisor · F-012 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (7)

Revisé el diff de F-012 (`deploy/`, `tools/`, `firmware/`, `server/README.md`, `config/`, `docs/configuracion-local.md`). Solo leí archivos, sin ejecutar nada. El contenedor, `serve.json`, los instaladores y `prueba-recuperacion` cumplen la lista. `firmware/README.md` y `server/README.md` no contienen datos privados.

**Bloqueantes**
- Ninguno.

**Mejoras** (se anotan en la ficha)
1. `tools/lib/install-funnel.ts:main`: el instalador hace `chmod 700` sobre `TINTERO_FUNNEL_DIR` aunque ya exista. Si el dueño pone una carpeta como `$HOME` por error, le cambia los permisos. Tampoco rechaza una carpeta dentro del repo, como sí hace `pki`, y ahí podría terminar un `compose.yaml` con la ruta de la llave. Corrección: rechazar rutas dentro del repo y carpetas existentes que no estén vacías o que no sean del nodo.
2. `tools/lib/install-funnel.ts`: no comprueba que `TINTERO_AUTHKEY_FILE` exista ni que tenga permisos 600. Corrección: avisar o fallar si el archivo no es 600.
3. `deploy/funnel/compose.yaml.in` (`env_file`): la ruta entra sin comillas en YAML. Una ruta con ` #` o `: ` cambiaría el significado del archivo. `parseKeys` rechaza `@%$` y saltos de línea, pero no esos caracteres. Corrección: insertar la ruta con `JSON.stringify`, o validar contra `^[A-Za-z0-9_./-]+$`.
4. `deploy/funnel/compose.yaml.in`: faltan topes de recursos (`pids_limit`, `mem_limit`, rotación de registros). Con `restart: unless-stopped`, el Funnel se reabre solo tras un reinicio de la máquina. Eso es coherente con «abrir lo hace el dueño» solo la primera vez. Corrección: añadir los topes y documentarlo en `server/README.md`.
5. `server/README.md` (paso 1): falta indicar que `tag:tintero` no tenga permisos de salida hacia el resto del tailnet en las ACL. El nodo es la parte expuesta a internet, y esa restricción limita el daño si lo comprometen. Corrección: una línea en el paso 1.
6. `firmware/README.md`: faltan dos reglas que ya piden la ficha y las reglas de entradas externas. La primera es poner tiempos de espera en toda petición (conexión y lectura). La segunda es rechazar `Content-Length` o `bytes` mayores de lo esperado antes de leer el cuerpo, y acotar `next_wake_s` a un rango sensato. El resto es correcto: CA propia, certificado de cliente, SNTP antes del TLS, cabeceras, 48 000 bytes, CRC-32 de zlib y una petición a la vez.
7. `tools/prueba-recuperacion`: un `dpi` aleatorio de 100 a 149 en cada ejecución crea hasta 50 vistas distintas en la caché del servidor. Eso es acotado, pero deja basura. Además, la nota «no abre nada a internet» es cierta, pero ahora el emulador sale por el nombre público (Funnel). Corrección: ajustar el comentario y confirmar que la caché tiene tope.

Detalle menor: en `docs/configuracion-local.md` las filas nuevas quedan separadas de la tabla por una línea en blanco, como las anteriores, y por eso se ven como tabla rota.

**Lo que cumple**
- **Contenedor:** `user` sin root (el instalador se niega con uid 0), `cap_drop: [ALL]`, `read_only` con `tmpfs`, `no-new-privileges`, imagen fijada por *digest* en `images.conf` (el instalador exige `@sha256:` de 64 hex), `TS_USERSPACE=true`, `TS_ACCEPT_DNS=false`, `--port=0`. `network_mode: host` está justificado en el comentario: reenviar a `127.0.0.1`.
- **`serve.json.in`:** solo el 443, `TCPForward` a `127.0.0.1:<puerto>` y `AllowFunnel` solo para `${TS_CERT_DOMAIN}:443`. Tintero sigue terminando el TLS y exigiendo el certificado de cliente.
- **Instaladores:** `parseKeys` conserva el rechazo de saltos de línea, `\0`, `@`, `%` y `$`, y el archivo local nunca se ejecuta. El puerto debe estar entre 1024 y 65535, las rutas son absolutas y los marcadores sin rellenar fallan. Los archivos quedan en 600 y las carpetas en 700. No arranca nada (hay `--dry-run`) y la prueba cubre el caso de root.
- **`prueba-recuperacion`:** `TINTERO_EMULATOR_SERVER` se valida con una expresión estricta. Solo mata el Chromium del servicio, filtrando por la etiqueta de la instancia. No usa `sudo`.

**Lecciones candidatas**
- Los valores de configuración local que se insertan en YAML o en unidades de systemd deberían pasar por una función común que los cite o los valide. Sería una línea en `CLAUDE.md`, o una regla de `semgrep` sobre `replaceAll("@…@", …)` en `tools/lib/`. Es la segunda vez, tras la unidad de systemd de F-010.

