## Informe del revisor · F-018 · modo juicio · vuelta 1 (etapa H, revisión 2)

**Veredicto:** APROBADO CON MEJORAS (4). Hay una decisión del dueño antes de publicar (mejora 1).

**Bloqueantes**
- Ninguno. En los puntos 1 a 5 no encontré datos personales, llaves, ejemplos con forma real, documentos inseguros ni controles que fallen abiertos.

**Mejoras** (se anotan en la ficha)
1. **Historia git, decisión del dueño.** Los 239 commits de `main` y los de `ver/F-018` llevan un solo autor, con su nombre de usuario y un correo personal visibles en la historia. El escáner (`tools/lib/public-scan.ts:247`) revisa solo el cuerpo de los mensajes (`%B`), no el autor ni el *committer*. El correo quedará público al publicar. La regla prohíbe reescribir la historia, así que el dueño decide si lo acepta o si publica una historia nueva con un correo `noreply`. Conviene que el escáner revise también `%an` y `%ae` para que no pase en silencio.
2. **Pista de lugar en los ejemplos.**
   - `config/hoy.data.example.en.json`, líneas 82–163, usa el desfase `-05:00` y las imágenes de la guía muestran «FESTIVO LUN 2 NOV», que sale de los festivos de Colombia. Con `config/agenda.views.example.json:3`, que usa `America/Lima`, las huellas no coinciden entre sí.
   - Los ejemplos en español (`hoy.data.example.json`, `agenda.data.example.json`) no cambiaron en esta rama.
   - Hay frases con rutina y hábitos personales: «Gimnasio 18:30», «Clase de cerámica», «Soldar los pines del adaptador…» y «Actualizar el servidor de música».
   - No identifican a nadie por sí solas. Pido que el dueño confirme que son inventadas. Si quiere más anonimato, que use `UTC` o `Z` y la zona `Etc/UTC`.
3. **Archivo temporal con llave.** `server/scripts/pki.ts`, en `pkiFirmware`, escribe `<target>.<hex>.tmp` con la llave y comprueba con `git check-ignore` solo el destino, no el temporal. Con el destino por defecto está cubierto por `firmware/include/*.tmp` en `.gitignore`. Con `--out` hacia otro archivo ignorado dentro del repo, una caída entre `writeFile` y `renameSync` dejaría un `.tmp` no ignorado. Se corrige comprobando también el temporal, o agregando `**/*.tmp` con llave a `tools/never-commit.txt`.
4. **Alcance de `never-commit` y del hook.**
   - Cualquiera puede saltarse el hook con `git commit --no-verify`. Es inherente y ya lo cubren `tools/revisar` y `tools/revision-publicacion`. Conviene decirlo en `CONTRIBUTING`.
   - `tools/never-commit.txt` no cubre `*.crt`, que no son secretos. Está bien, pero hay que mantener el nombre `ca.key`, que sí lo cubre `**/*.key`.

**Punto por punto**
1. **Datos personales o de infraestructura.** Ningún hallazgo en los archivos nuevos o cambiados, salvo lo de las mejoras 1 y 2.
   - Revisé nombres, correos, rutas `/home/<usuario>`, Wi-Fi y IP (solo loopback y rangos de documentación).
   - Los `*.ts.net` son todos `*.example.ts.net`, y `docs/hardware/**` no tiene rutas ni nombres.
   - `CLAUDE.md` nombra solo el título de una nota de Trilium, sin ids.
2. **Llaves o algo generado con ellas.** No hay PEM reales. Las pruebas usan `"A".repeat(n)` y valores de relleno. `secrets.h.example` tiene solo `your-network-name` y `your-network-password`. `tintero_certs.h` y `secrets.h` están en `.gitignore` y en `never-commit`.
3. **Ejemplos que parezcan reales.** Todos son `example.com`, `calendario.example` o `<key>`. Ninguno tiene forma de token.
4. **Documentos inseguros.** Ninguno.
   - `exposure.md`, `certificates.md` y `hardware.md` exigen TLS de extremo a extremo, `127.0.0.1`, lista de aparatos obligatoria y permisos 600/700.
   - Prohíben terminar el TLS en un proxy, `0.0.0.0`, apagar la verificación y guardar la llave de la CA sin cifrar o en la nube.
   - `getting-started` usa `http://127.0.0.1` solo para el emulador local.
5. **Código y herramientas.**
   - `pki firmware` lee cada PEM con tope de 4 096 bytes y comprueba su forma. Acepta una sola pantalla y exige `--host`.
   - Escribe con `wx` y modo 600, y lo reemplaza de forma atómica. Se niega a escribir dentro del repo si git no ignora el destino, y falla cerrado ante cualquier error. Nunca imprime la llave.
   - `never-commit.ts` falla cerrado: si la lista está vacía o no se lee, o si falla git, devuelve 1. El hook usa `|| exit 1`.
   - `public-scan.ts` informa solo archivo, línea y tipo, sin el valor. Un archivo ilegible o mayor de 16 MiB cuenta como hallazgo. Las excepciones exigen un tipo conocido, un motivo y una línea bien formada.
   - `tools/revisar` y `tools/revision-publicacion` corren los contenedores con `--network none`, `--no-verification` y la imagen fijada por *digest*.
6. **Firmware.**
   - Valida al servidor solo con `setCACert(TINTERO_CA_PEM)`; no hay `setInsecure` ni CA públicas.
   - Tiene tiempos de espera de conexión (10 s), lectura (20 s) y *handshake* (15 s), y de Wi-Fi y SNTP (20 s y 15 s).
   - Mide el `Content-Length` antes de leer, usa un `BoundedSink` con tope y comprueba CRC y tamaño. Solo lleva la llave de su pantalla, y no hay nombres ni lugares de su autor.
   - Imprime el SSID por el puerto serie, lo cual es local y aceptable.
7. **`example-json`.**
   - Es solo `GET` a `/tasks.json`, con el manifiesto `writes:false`.
   - `parseExampleJson` en `config.ts` exige `https://`; `http://127.0.0.1` se rechaza.
   - La respuesta se acota a 64 KiB mientras se lee, con 5 s de espera; el cliente `guardedHttp` rechaza las redirecciones.
   - Cada campo se valida: máximo 100 elementos, `id` con patrón y sin repetirse, título de 1 a 200 caracteres, `done` booleano y `due` con fecha válida. Un campo malo rechaza toda la respuesta, y los registros llevan solo conteos y códigos.
8. **Dependencias.** `package.json` solo agrega `"license": "MIT"`, sin dependencias nuevas en npm. `TRUFFLEHOG_IMAGE` está fijada por *digest* (3.99.7). `NOTICE` declara GxEPD2 como GPL-3.0 y el aviso sobre el binario es correcto. Las imágenes PNG no tienen fragmentos de metadatos (`tEXt`, `iTXt`, `zTXt`, `eXIf`, `tIME`).

**Lo que no verifiqué**
- No ejecuté `gitleaks`, `trufflehog` ni `public-scan --history`, porque no debía apoyarme en la revisión 1. La historia previa a esta rama tampoco la revisé archivo por archivo.
- No abrí `docs/hardware/tintero-buttons/out/*.html` ni `*.svg` línea por línea. Solo busqué por patrones y no encontré rutas, nombres ni IP.
- No miré `docs/guide/images/calibracion.png` ni `architecture.*.svg` con la vista de imágenes.
- No mostré las pruebas de la rama.
- Las comprobaciones de render y de accesibilidad no se pueden correr aquí: no hay navegador.

**Lecciones candidatas**
- Los controles de publicación no miran el autor ni el correo de la historia → agregar `%an` y `%ae` a `scanHistory` en `tools/lib/public-scan.ts`, con una lista de autores permitidos fuera del repo.
- Un archivo temporal con llave puede quedar sin ignorar → regla en `tools/never-commit.txt` (`**/*.tmp` junto a llaves) o `ensureIgnoredByGit(temp)`.
