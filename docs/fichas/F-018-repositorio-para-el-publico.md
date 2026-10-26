# F-018 · El repositorio, listo para que otra persona lo use

**Estado:** aprobada · el dueño aprobó la ficha el 2026-10-26 (D1 a D11; D10 cambiada por él) y dio libertad al arquitecto para decidir y desarrollar hasta completarla; **la unión final a `main` espera su aprobación** (puerta 2) · ADR-0058 a ADR-0062
**Modelo del programador:** sonnet (etapas C, D y E); las demás son documentos, herramientas y revisión
**Dependencias nuevas permitidas:** ninguna en npm. Una imagen de Docker: `trufflesecurity/trufflehog@sha256:0d003fc3abc4e1565eca8462b992001314de51451e96e3c44de80d116794d5d1` (3.99.7), en `tools/images.conf` (D11). Solo si hace falta R23, una imagen de `git filter-repo` fijada por *digest*

## Por qué
El repositorio ya es **público** en GitHub, pero no está hecho para que otra persona lo use: no tiene licencia (sin licencia nadie puede usarlo legalmente), el `README.md` dice «todavía privado» y está solo en español, el firmware que funciona en el panel real vive fuera del repo, no hay circuito de los botones ni imágenes de lo que se ve, y no hay guía para agregar integraciones. Esta ficha cierra esos huecos **sin que se filtre nada privado y sin abrir una vulnerabilidad**, con una revisión de seguridad doble antes de dar por publicado cada cambio (etapa H).

Aplican ADR-0002, ADR-0004, ADR-0013, ADR-0022, ADR-0023, ADR-0029 y ADR-0030, y todo `docs/seguridad.md`.

## Lo que se encontró al prepararla (2026-10-26)
- La visibilidad del repo ya es **pública**; sin licencia.
- La lista de términos privados (árbol e historia) y gitleaks (163 *commits*): **limpios**. Un barrido aparte de rutas personales, nombres `*.ts.net`, correos y direcciones IP solo encontró datos de prueba (`192.0.2.x`, `192.168.1.10`, `/home/x/repo`, `tintero.ejemplo.ts.net`).
- **Los 236 *commits* llevan el correo personal del dueño** como autor. El dueño decidió dejarlo así (D10); en cambio, **en el contenido** de los archivos y en los mensajes no puede aparecer.
- El firmware que funciona (fuera del repo, unas 1 400 líneas de C++ con PlatformIO) trae su `secrets.h` y su `tintero_certs.h` fuera de git (bien), pero su generador de certificados tiene **el nombre público real escrito en el código** y hay comentarios con datos personales. **No se copia tal cual** (etapa D).
- El firmware usa **GxEPD2, que es GPL-3.0** (D1).
- **Auditoría de la historia (etapa 0, hecha el 2026-10-26): sin brechas.** Las 50 ramas públicas están todas en la copia local (no hay ramas sin traer ni *pull requests*); 236 *commits*, 1 079 archivos distintos en toda la historia y una sola ruta borrada (`tools/images.env`, renombrada). Cuatro revisiones, cada una por su lado: la lista de términos privados (`--history`, todas las ramas), gitleaks, un barrido propio de cada archivo y cada mensaje (correos, rutas personales, `*.ts.net`, IP, bloques PEM, tokens de GitHub, Telegram, Tailscale y AWS, direcciones de calendarios, Jira, teléfonos, cadenas de alta entropía y metadatos de PNG) y trufflehog **sin red y sin verificación** (así ningún hallazgo sale a servicios de terceros). Lo único que apareció son datos de prueba (`*.example`, `192.168.1.10`, `10.0.0.1`, `/home/x/`), los correos de la licencia de Terminus y los OID de los certificados. En los mensajes, el único correo es el `noreply` de la línea *Co-Authored-By*. **No hay nada que quitar de la historia.**
- El kit de circuitos `protoboard-iso` (MIT, del dueño) **funciona desde esta máquina por su línea de comandos**: una prueba con el ESP32 DevKit y dos botones quedó colocada y aprobada por su `review`. El adaptador DESPI-C02 no se coloca solo: necesita sus pines escritos a mano, como en el ejemplo del kit (`examples/epaper-esp32.json`). Se puede hacer en esta ficha (etapa F); si falla, queda como pendiente y no bloquea lo demás.

## Decisiones

| # | Decisión | Propuesta | Estado |
|---|----------|-----------|--------|
| **D1** | Licencia | **MIT** para todo lo propio (servidor, emulador, contrato, herramientas, firmware, documentos e imágenes). `LICENSE` con `Copyright (c) 2026 Tintero contributors`. Las letras conservan las suyas (`server/fonts/LICENSE-*.txt`). **Ojo con el firmware:** el código propio puede ser MIT, pero un binario compilado lleva GxEPD2 y entonces el binario entero queda bajo **GPL-3.0**. Propuesta: en esta ficha **no se publican binarios** (solo código fuente), y `firmware/README.md` y `NOTICE` lo explican | ✅ (dueño, 2026-10-26) |
| **D2** | Idioma de lo público | `README.md` en **inglés** (lo primero que ve cualquiera en GitHub) y `README.es.md` en español, enlazados entre sí. La guía de uso en `docs/guide/en/` y `docs/guide/es/`, con los mismos archivos en los dos idiomas. Lo interno (fichas, ADR, informes, lecciones, `PROCESO.md`) sigue en español, con una línea en inglés en `docs/README.md` que lo explica. Ajuste de la regla de idioma de `CLAUDE.md` | ✅ |
| **D3** | i18n de lo que se dibuja | Las vistas ganan `locale` (`es` por defecto, `en`): nombres de días y meses, «Hecho hoy», «+N más», «FESTIVO», «sin datos desde»… salen de un catálogo por idioma. Se elige en la configuración de vistas, no en el aparato | ✅ |
| **D4** | Firmware en el repo | El firmware probado pasa a `firmware/` y **el repo queda como copia maestra** (la copia de afuera deja de editarse). Antes se limpia (etapa D): sin nombres de personas, sin nombre público, comentarios en **inglés** (regla de código del repo). ADR-0013 sigue: el dueño lo escribe y aprueba cada cambio | ✅ |
| **D5** | Certificados del firmware | El generador en Python se reemplaza por un subcomando de la herramienta que ya existe: `npm run pki -- firmware <carpeta-pki> --host <nombre> <pN>…`, que escribe `firmware/include/tintero_certs.h` con permisos 600. **El nombre es obligatorio y nunca tiene un valor por defecto.** Así queda un solo lenguaje y una sola herramienta | ✅ |
| **D6** | Circuito de ejemplo | Con `protoboard-iso`, por su línea de comandos y con el agente `circuit-layout` (Sonnet): ESP32 DevKit + DESPI-C02 con el panel + los dos botones (Mover en GPIO32, Aceptar en GPIO33, cada uno contra 3V3, con la *pull-down* interna, como el firmware). En el repo va el **SVG** (y el JSON del circuito, para regenerarlo); la página interactiva solo si funciona sin servidor | ✅ |
| **D7** | Imágenes | Solo **generadas con datos de ejemplo** (`config/*.example.json`) y con reloj fijo: una por vista de ejemplo, más el circuito y un diagrama de cómo se conectan las piezas. **Ninguna foto del panel real** salvo que el dueño saque una con datos de ejemplo y la apruebe aparte. Todas sin metadatos | ✅ |
| **D8** | Agregar módulos (integraciones y bloques) | Guía paso a paso (`docs/guide/*/integrations.md`) con `festivos` como ejemplo resuelto (la integración más simple: sin llave, solo `GET`), más una **plantilla real que compila y tiene pruebas**: la integración de ejemplo `example-json` (lee un JSON público por `https`, sin llave) en `server/src/integrations/example-json.ts`, registrada pero **apagada** si no se configura. La guía de bloques sale de `server/README.md` (*Cómo se escribe un bloque nuevo*) | ✅ con la plantilla |
| **D9** | Ajustes de GitHub | Activar *secret scanning* con *push protection*, *private vulnerability reporting* y las alertas de Dependabot; agregar `SECURITY.md`. Los comandos (`gh api …`) los corre el dueño, porque cambian algo hacia afuera | ✅ |
| **D10** | Correo en los *commits* y brechas en la historia | El correo personal **se queda** como autor de los *commits*, los de antes y los que vengan (el integrador no cambia su identidad). Todo lo demás se revisa: el contenido de cada archivo y cada mensaje, en el árbol y en **toda** la historia, no puede traer información privada ni privilegiada. Si alguna revisión encuentra una brecha en un *commit*, se **quita de la historia** con el procedimiento de R23 (excepción a ADR-0022 que aprobó el dueño solo para esto) | ✅ (dueño, 2026-10-26) |
| **D11** | Segundo detector de secretos | Para que la revisión doble no dependa de una sola herramienta: **trufflehog** en Docker, fijado por *digest*, sobre el árbol y la historia, además de gitleaks. Siempre con `--network none` y `--no-verification` | ✅ |

## Decisiones del arquitecto (con la libertad que dio el dueño)

| # | Decisión |
|---|----------|
| **A1** | **Quién hace cada etapa.** El arquitecto: 0, B, F, R21 y H (todo lo de `tools/` y el circuito), en la rama `arq/F-018`, que se une a las ramas de trabajo. El programador: C, D, E y D8 en una primera vuelta, y G (documentación) en una segunda, en la misma rama `dev/F-018`, porque la guía describe lo que hizo la primera. El verificador: `tests/acceptance/F-018/` |
| **A2** | **Importar el firmware.** El arquitecto copia el firmware probado a `firmware/` de la carpeta del programador, **sin** su generador de certificados y con los datos privados ya quitados, antes de que haya un *commit*; el programador lo termina de limpiar (R11). Los hooks (términos privados y R5) no dejan pasar un descuido |
| **A3** | **Ejemplos en inglés.** `config/hoy.views.example.en.json` y `config/hoy.data.example.en.json`: los mismos de `hoy`, con `"locale": "en"` y títulos y datos en inglés. Son los que muestra `README.md`. Los demás ejemplos siguen en español |
| **A4** | **Compilar el firmware aquí.** El arquitecto compila `firmware/` con PlatformIO en un entorno aparte, fuera del repo y con la versión fijada (CA12a). Grabarlo y mirarlo en el panel lo hace el dueño (CA12b) |
| **A5** | **Prueba de humo en limpio** (CA20): la hace un agente aparte, en un *worktree* nuevo, que solo puede seguir la guía |

## Alcance
Etapas en este orden (la 0 ya se hizo al preparar la ficha y se repite en H). Cada una con código sigue el ciclo de `docs/PROCESO.md`; las que son solo documentos las escribe el arquitecto y las revisa la etapa H. Si el dueño lo prefiere, C (i18n) puede salir como ficha aparte.

- **0 · Auditoría de la historia** (D10): las cuatro revisiones de *Lo que se encontró* sobre todas las ramas. Resultado del 2026-10-26: sin brechas. Si aparece una (ahora o en H), R23.
- **A · Base legal y de seguridad:** `LICENSE`, `NOTICE` (GxEPD2, ArduinoJson, letras), `SECURITY.md`, `CONTRIBUTING.md`, ajustes de GitHub (D9).
- **B · Controles que fallan cerrado:** el *pre-commit* bloquea por nombre los archivos que nunca van al repo, aunque se agreguen con `git add -f`; `.gitignore` los cubre; y una herramienta `tools/lib/public-scan.ts` para el barrido de la etapa H.
- **C · i18n de lo que se dibuja** (D3).
- **D · Firmware en el repo** (D4), limpio, con `secrets.h.example`.
- **E · Certificados de servidor y firmware** (D5), con la guía completa.
- **F · Circuito de los botones** (D6). Si el kit no logra colocar el DESPI-C02 en 3 intentos del agente, queda **pendiente** en `docs/guide/*/hardware.md` y la etapa se cierra sin él.
- **G · Documentación e imágenes** (D2, D7, D8): README en los dos idiomas, guía de inicio que funcione en una máquina limpia, guía de hardware, de exposición, de integraciones y de bloques.
- **H · Revisión doble antes de publicar** (obligatoria, cierra la ficha; ver *Seguridad*).

**Fuera de alcance:** binarios del firmware e instalador desde el navegador (por D1); imagen de Docker del servidor y `compose.yaml` de instalación; integración continua en GitHub Actions; la web de configuración; Jira (F-016); cambiar el contrato v1; reescribir la historia de git por cualquier motivo que no sea quitar una brecha (R23); cambiar el autor de los *commits*; traducir fichas, ADR o informes; las mejoras anotadas de fichas anteriores.

## Requisitos

**A · Base**
- **R1.** `LICENSE` con el texto MIT exacto y `Copyright (c) 2026 Tintero contributors`. `package.json` con `"license": "MIT"`.
- **R2.** `NOTICE` lista el *software* de terceros que se distribuye o que el firmware enlaza, con su licencia: GxEPD2 (GPL-3.0), ArduinoJson (MIT), DejaVu (su licencia), Terminus (OFL-1.1). Dice que el código fuente del firmware es MIT, pero que un binario compilado con GxEPD2 se distribuye bajo GPL-3.0.
- **R3.** `SECURITY.md` (inglés, con el enlace a la versión en español): cómo reportar (*private vulnerability reporting* de GitHub, nunca un *issue* público), qué se considera vulnerabilidad, y el modelo de amenazas en cinco líneas (mTLS por pantalla, silencio ante extraños, llaves fuera del repo, vistas sin red, solo `127.0.0.1`).
- **R4.** `CONTRIBUTING.md`: cómo instalar (`npm ci && npm run setup`), las comprobaciones (`typecheck`, `lint`, `test`, `tools/revisar`), que nada personal ni secreto entra, y que el proceso con agentes (`docs/PROCESO.md`) es el del autor y **no** se le exige a quien colabora.

**B · Controles**
- **R5.** `tools/git-hooks/pre-commit` rechaza cualquier archivo a guardar cuya ruta case con `tools/never-commit.txt` (nuevo): `**/secrets.h`, `**/tintero_certs.h`, `**/*.key`, `**/*.p12`, `**/*.pfx`, `**/*.pem` salvo `**/*.example.pem`, `**/devices.txt`, `**/calendarios.json`, `**/integrations.json`, `**/views.json`, `**/state.json`, `**/.env*` salvo `**/.env.example`. Avisa con la ruta y sale con 1. **Falla cerrado:** si no puede leer la lista, bloquea.
- **R6.** `.gitignore` agrega `firmware/.pio/`, `firmware/include/secrets.h` y `firmware/include/tintero_certs.h`.
- **R7.** `tools/lib/public-scan.ts --tree | --history [--json <salida>]`: busca, en todo archivo de texto que siga git (y en la historia con `--history`), rutas `/home/<usuario>/` y `C:\Users\<usuario>\`, correos (salvo `@example.com`, `@example.org` y `noreply`), nombres `*.ts.net` que no sean `ejemplo` ni `example`, direcciones IPv4 fuera de `127.0.0.0/8`, `0.0.0.0`, `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` y `192.168.1.10` y `10.0.0.1` (las de prueba que ya existen), bloques `-----BEGIN … PRIVATE KEY-----` y cadenas de 32 caracteres o más con entropía ≥ 4,0 bits por carácter que no estén en `package-lock.json`. Para los archivos que no son texto, lista ruta, tipo y tamaño, y en PNG y JPEG reporta todo bloque de metadatos (`tEXt`, `iTXt`, `zTXt`, `eXIf`, EXIF, XMP). El correo del autor en los metadatos de los *commits* no cuenta (D10); en el contenido de un archivo o en un mensaje, sí. Reporta archivo y línea, nunca el valor encontrado. Salida 0 limpio, 1 hallazgo, 2 error de uso; ante un error de lectura, 1 (falla cerrado). Las excepciones viven en `tools/public-scan-allow.txt`, una por línea (archivo y patrón) con su motivo; la primera, los valores de relleno de CA5 en esta misma ficha.
- **R8.** `tools/revisar` corre `public-scan --tree` como una herramienta más («publicación»).

**0 · Historia** (D10)
- **R23. Si una revisión encuentra una brecha en la historia** (una llave, un token, una dirección secreta, un dato personal o de infraestructura en algún *commit* de cualquier rama), en este orden:
  1. **Dar por filtrado lo que se encontró, desde el primer *push*.** Lo primero es **revocar o cambiar** la llave, el token o la dirección (quitarlo de la historia no deshace que alguien ya lo haya copiado). Lo hace el dueño; el arquitecto le da los pasos.
  2. Congelar `main` y todas las ramas: ningún agente trabaja mientras dura la limpieza.
  3. Respaldo de la copia completa (`git clone --mirror` a una carpeta fuera del repo, 700), por si la limpieza sale mal.
  4. Reescribir **todas** las ramas con `git filter-repo` (en un contenedor fijado por *digest*, sin red) con `--replace-text` para quitar el valor, o `--invert-paths` para quitar el archivo entero. El correo del autor no cambia.
  5. Repetir las cuatro revisiones de la etapa 0 sobre la copia reescrita: tienen que salir limpias, y la lista de archivos de `main` tiene que ser la misma de antes (salvo lo quitado).
  6. Subir con `git push --force-with-lease` cada rama reescrita. Es la **única** excepción a ADR-0022; la hace el integrador con un encargo que nombra la brecha (sin el valor) y la aprobación del dueño **para ese caso**.
  7. El dueño pide al soporte de GitHub que borre las vistas en caché y las referencias viejas de los *commits* afectados, y revisa si hay *forks* (hoy no hay). Las otras copias de trabajo y las carpetas de los agentes se vuelven a clonar.
  8. Agregar el término a la lista privada y, si hace falta, un patrón nuevo a `public-scan`, para que no vuelva a pasar. Anotarlo en `docs/lecciones.md` (sin el valor).

**C · i18n** (D3)
- **R9.** El archivo de vistas acepta `"locale": "es" | "en"` en la raíz (por defecto `es`). Todo texto fijo que dibuja un bloque sale de `server/src/engine/i18n/<locale>.ts`; `dates.ts` toma los nombres de días y meses del catálogo. Con `es` las imágenes son **idénticas** a las de hoy.
- **R10.** Los dos catálogos tienen exactamente las mismas claves (lo comprueba una prueba unitaria). Un `locale` desconocido da `ConfigError` con la ruta JSON `locale`.
- **R10b.** El catálogo `en` tiene, como mínimo, estos valores (el `es` son los de hoy): días cortos `sun mon tue wed thu fri sat`; meses cortos `jan feb mar apr may jun jul aug sep oct nov dec`; meses largos `JANUARY` … `DECEMBER`; `Today` / `Tomorrow`; `no data since HH:MM` y `no data since DD/MM HH:MM`; `HOLIDAY TODAY` y `HOLIDAY <DÍA> <D> <MES>` (p. ej. `HOLIDAY MON 2 NOV`); `All day` y ` · all day`; `No category`; las etapas `IN PROGRESS`, `TO DO`, `DONE TODAY` y sus vacíos `Nothing in progress.`, `Nothing to do.`, `Nothing done today.`; `+N more`. Todo otro texto fijo que el programador encuentre también va al catálogo, y lo lista en su informe.
- **R10c.** Los ejemplos de A3 pasan la validación de vistas y datos, y con ellos `hoy` se dibuja sin textos del catálogo `es`.

**D · Firmware**
- **R11.** `firmware/` con `platformio.ini` (plataforma fijada, como hoy), `src/`, `include/secrets.h.example` y `README.md` (el actual, más cómo compilar y grabar). Ningún archivo trae nombres de personas, nombres públicos, redes Wi-Fi ni direcciones; los comentarios, en inglés. `TINTERO_HOST` sale **solo** del archivo que genera D5.
- **R12.** El firmware valida al servidor **solo** con la CA de Tintero (`setCACert`), nunca con `setInsecure` ni con las CA públicas, y con tiempos de espera y límites antes de leer, como pide `firmware/README.md` §3.
- **R13.** `firmware/README.md` advierte que las llaves quedan legibles en la *flash* si roban el aparato mientras no haya cifrado (L6), y cómo revocar una pantalla: quitar su línea de la lista de aparatos y reiniciar el servidor.

**E · Certificados**
- **R14.** `npm run pki -- firmware <carpeta-pki> --host <nombre> <pN> [--out <archivo>]` (**una sola pantalla**: cada aparato lleva solo su propia llave, así robar uno no compromete otro) escribe `TINTERO_HOST`, `TINTERO_DEVICE_ID` (`"pN"`), y como cadenas PEM `TINTERO_CA_PEM`, `TINTERO_DEVICE_CERT_PEM` y `TINTERO_DEVICE_KEY_PEM`. El firmware usa solo esas constantes (sin una lista de pantallas en el código). Por defecto escribe en `firmware/include/tintero_certs.h`, con modo **600**, y **nunca** imprime una llave en la salida. Sin `--host`, con un nombre que no sea un DNS válido, con cero o más de una pantalla, con una pantalla sin certificado o con un PEM de más de 4 096 bytes → error de uso, salida 2, y no escribe nada. Si el destino existe, lo reemplaza de forma atómica (escribe un temporal 600 en la misma carpeta y lo renombra).
- **R15.** Si `--out` cae dentro del repo en un archivo que git **no** ignora, se niega (salida 2): un archivo con llaves solo puede quedar donde git no lo vea.
- **R16.** Una guía (`docs/guide/*/certificates.md`) cubre todo el camino: `init` → `server` → `device` → `firmware` → la lista de aparatos → probar con el emulador; dónde guardar la CA (fuera del repo, con respaldo cifrado), las vigencias (ADR-0029) y cómo reemitir.

**F · Circuito**
- **R17.** `docs/hardware/tintero-buttons/circuit.json`, su SVG de frente y, si funciona sin servidor, su página. Conexiones: DESPI-C02 BUSY→GPIO4, RES→GPIO16 (RX2), D/C→GPIO17 (TX2), CS→GPIO5, SCK→GPIO18, SDI→GPIO23, 3.3V→3V3, GND→GND; Mover entre GPIO32 y 3V3; Aceptar entre GPIO33 y 3V3. `lang: "en"` y `description` en los dos idiomas. Su `review` (perfil `lesson`) termina en APPROVED.

**G · Documentación**
- **R18.** `README.md` (inglés) y `README.es.md`: qué es, una imagen de la vista `hoy` de ejemplo, qué piezas hacen falta, los tres pasos para verlo funcionar **sin hardware** (instalar, arrancar con los ejemplos, el emulador), los enlaces a la guía y la licencia. Sin «todavía privado».
- **R19.** `docs/guide/{en,es}/`: `getting-started.md` (de una máquina limpia al emulador mostrando `hoy`), `hardware.md` (piezas, cableado, circuito, firmware), `certificates.md` (R16), `exposure.md` (Tailscale Funnel en un nodo propio u otra salida TCP con TLS de punta a punta; **nunca** HTTP sin TLS), `configuration.md` (vistas, datos, integraciones, llaves en archivos 600 fuera del repo), `integrations.md` (D8), `blocks.md`. Cada archivo existe en los dos idiomas y tiene los mismos títulos de sección.
- **R20.** Todo ejemplo de los documentos usa valores de relleno: `tintero.example.ts.net`, `example.com`, `p1`, `/path/to/pki`, y nunca valores que parezcan reales.
- **R21.** Las imágenes de la guía salen de un solo script, `tools/imagenes-guia` (nuevo), con los ejemplos de `config/`, el reloj `2026-10-26T13:00:00Z` y el panel `w=800,h=480,dpi=124,depth=1`, en `docs/guide/images/`. Volver a correrlo da los mismos bytes.
- **R22.** (Si se aprueba D8) `example-json`: solo `GET` a la `baseUrl` `https` que se configure, `needsKey: false`, respuesta ≤ 64 KiB antes de parsear, rutas permitidas en su manifiesto (ADR-0043), sin redirecciones, y cada campo validado antes de llegar al motor.

**Cambio pedido en la puerta 2 (dueño, 2026-10-26):** el proyecto sigue en español por defecto (`locale` ausente = `es`), pero **lo público que ve quien llega va en inglés**:
- **R18b.** `README.md` gana una sección «How it works» en inglés, con el diagrama (`architecture.en.svg`), la galería de vistas `today`, `board` y `agenda` (`hoy-en.png`, `tablero-en.png`, `agenda-en.png`), cómo se usan los dos botones (Move y Accept, toque corto y largo, ADR-0005) y el circuito. **Toda imagen que enlaza `README.md` está en inglés.** `README.es.md` tiene la misma sección en español con las imágenes `-es`.
- **R21b.** `tools/imagenes-guia` dibuja `hoy`, `tablero` y `agenda` en los dos idiomas (`<vista>-en.png` y `<vista>-es.png`); para eso hacen falta `config/tablero.{views,data}.example.en.json` y `config/agenda.{views,data}.example.en.json` (como los de A3: `"locale": "en"`, títulos y datos en inglés, inventados).
- **CA18b.** Toda imagen que enlazan `README.md` y `docs/guide/en/` termina en `-en.png` o `.en.svg`, o es el circuito; toda imagen de `README.es.md` y `docs/guide/es/`, en `-es.png` o `.es.svg`, o es el circuito; todas existen. Con los ejemplos `en` de `tablero` y `agenda`, el HTML de su vista no trae textos del catálogo `es` (como CA10b).

## Contrato
- `server/scripts/pki.ts`: subcomando nuevo `firmware`, con los errores de R14 y R15. Los subcomandos actuales no cambian.
- `server/src/engine/i18n/index.ts`:
  ```ts
  export type Locale = "es" | "en";
  export function messages(locale: Locale): Messages; // las mismas claves en todos los idiomas
  ```
- `tools/lib/public-scan.ts`: la interfaz de R7; `tools/never-commit.txt` y `tools/public-scan-allow.txt`, un patrón por línea, `#` para comentarios.
- `server/src/integrations/example-json.ts` (D8): el mismo contrato que `holidays-nager.ts`.

## Criterios de aceptación

**0 · Historia**
- **CA0.** Sobre todas las ramas de `origin` (comparadas antes con `git ls-remote`: ninguna sin traer), la lista de términos privados `--history`, gitleaks, `public-scan --history` y trufflehog (`--network none --no-verification`) salen limpios, o cada hallazgo es un dato de prueba con su excepción y su motivo en `tools/public-scan-allow.txt`. Si no, se aplica R23 y CA0 se repite sobre la historia reescrita.

**A · Base**
- **CA1.** `LICENSE` es igual, línea por línea, al texto MIT de la SPDX con el año 2026 y `Tintero contributors`; `package.json` dice `"license": "MIT"`; `NOTICE` nombra GxEPD2 (GPL-3.0), ArduinoJson (MIT), DejaVu y Terminus (OFL-1.1).
- **CA2.** Un script que lee el campo `license` de cada paquete de producción (`npm ls --omit=dev --all --json` + su `package.json` en `node_modules`) no encuentra ninguno con GPL, AGPL, LGPL, SSPL ni sin licencia. La lista queda en el informe.
- **CA3.** `SECURITY.md` y `CONTRIBUTING.md` existen, en inglés, con enlace a su versión en español y las secciones de R3 y R4.

**B · Controles**
- **CA4.** En una copia de prueba del repo (fuera de `main`), con los hooks puestos: `git add -f firmware/include/secrets.h` con valores de relleno y `git commit` → bloqueado, salida 1, el mensaje nombra la ruta. Lo mismo con `x.key`, `devices.txt`, `state.json` y `.env.local`. `config/x.example.pem` y `.env.example` pasan. Con `tools/never-commit.txt` borrado → bloquea todo *commit*.
- **CA5.** `public-scan --tree` sobre `main` → salida 0. En una copia de prueba, un archivo con cada uno de estos da salida 1 y el archivo y la línea correctos, **sin** el valor en la salida: `/home/ana/x`, `C:\Users\ana\x`, `ana@gmail.com`, `casa.tail1234.ts.net`, `100.101.102.103`, `10.1.2.3`, un bloque `BEGIN EC PRIVATE KEY` y `Zx8Qp2Lm9Rt4Vb7Nc1Kd6Hf3Jg5Ws0Ye` (32 caracteres). No marcan nada: `tintero.example.ts.net`, `192.0.2.1`, `127.0.0.1`, `noreply@github.com`.
- **CA6.** Un PNG con un bloque `tEXt` (`Author=ana`) → salida 1 con la ruta; el mismo PNG sin el bloque → 0. Todo PNG de `docs/` sale sin metadatos.
- **CA7.** `public-scan --history` sobre `main` → salida 0, o cada hallazgo con su excepción y su motivo en `tools/public-scan-allow.txt` (solo los que el dueño apruebe).

**C · i18n**
- **CA8.** Con los ejemplos de `hoy`, el reloj `2026-10-26T13:00:00Z` y P124, la imagen con `locale` ausente y con `"es"` es igual, byte a byte, a la de `main` antes de la ficha (grabada en `tests/acceptance/F-018/`).
- **CA9.** Con `"en"`: el título del mes dice `OCTOBER 2026`, la próxima festividad `HOLIDAY MON 2 NOV` y la lista vacía de `tablero`, el texto en inglés del catálogo; ningún texto del HTML de `hoy`, `tablero` ni `agenda` coincide con una cadena del catálogo `es` que no esté también en `en`.
- **CA10.** `"locale": "fr"` → `ConfigError` con ruta `locale`; los catálogos `es` y `en` tienen el mismo conjunto de claves.
- **CA10b.** Con los ejemplos de A3, el reloj de CA8 y P124, `hoy` se dibuja sin error y su HTML no contiene ninguno de `Hoy`, `Mañana`, `FESTIVO`, `sin datos desde`, `más`, `OCTUBRE`, `POR HACER`, `HECHO HOY`, `Todo el día`.

**D · Firmware**
- **CA11.** `public-scan --tree` y la lista de términos privados sobre `firmware/` → 0. `grep -rn setInsecure firmware/` → nada. `grep -rn 'TINTERO_HOST\[\] = "' firmware/src firmware/include` → nada (el nombre solo está en el archivo generado, que git ignora).
- **CA12a (arquitecto, A4).** Desde una copia limpia: copiar `secrets.h.example` a `secrets.h`, generar `tintero_certs.h` con D5 y una PKI de prueba, y `pio run` → compila.
- **CA12b (lo corre el dueño).** Grabado en el ESP32 con sus llaves reales, el panel muestra `hoy` como antes de la ficha.

**E · Certificados**
- **CA13.** Con una PKI de prueba en una carpeta temporal (`init`, `server`, `device p1`, `device p2`): `pki firmware <pki> --host tintero.example.ts.net p1 --out <tmp>/c.h` → el archivo tiene modo 600, trae `TINTERO_HOST` = `tintero.example.ts.net`, `TINTERO_DEVICE_ID` = `p1`, `TINTERO_CA_PEM`, `TINTERO_DEVICE_CERT_PEM` y `TINTERO_DEVICE_KEY_PEM`, cada PEM igual al de su archivo, y **ningún** byte del certificado ni de la llave de `p2`; la salida de la herramienta no contiene `PRIVATE KEY`.
- **CA14.** Sin `--host`, con `--host "a b"`, sin pantalla, con `p1 p2`, con `p9` sin certificado o con un PEM de 5 000 bytes → salida 2 y el destino no existe (ni un temporal en la carpeta).
- **CA15.** `--out` en un archivo del repo que git no ignora (`docs/c.h`) → salida 2; en `firmware/include/tintero_certs.h` (ignorado) → escribe.
- **CA16.** El emulador, con la CA y los certificados de la PKI de prueba, contra el servidor con esa PKI en `127.0.0.1`, hace una despertada completa (índice e imagen de `current`).

**F · Circuito**
- **CA17.** `protoboard-iso review docs/hardware/tintero-buttons --profile lesson` → APPROVED; `netlist` tiene exactamente las conexiones de R17. Si la etapa queda pendiente, `hardware.md` lo dice en los dos idiomas y ningún otro CA depende de ella.

**G · Documentación**
- **CA18.** Cada archivo de `docs/guide/en/` tiene su par en `docs/guide/es/` con el mismo número de títulos `##`; todo enlace relativo de `README.md`, `README.es.md` y `docs/guide/` apunta a un archivo que existe.
- **CA19.** `tools/imagenes-guia` dos veces seguidas → los mismos bytes en `docs/guide/images/` (lo comprueba la suma SHA-256 de cada archivo).
- **CA20 (prueba de humo en limpio).** Un agente **sin** acceso a la configuración local del dueño, en un *worktree* nuevo y siguiendo **solo** `docs/guide/en/getting-started.md`, llega a ver `hoy` en la carpeta del emulador. Todo paso que tuvo que adivinar queda como hallazgo y se corrige en la guía.
- **CA21.** (D8) Las pruebas de `example-json` cubren: respuesta de 64 KiB + 1 byte → error antes de parsear; redirección → error; `http:` → `ConfigError`; un campo de tipo incorrecto → no llega al motor.

**Lo que ya existe**
- **CA22.** `npm run test:acceptance` pasa (con los intermitentes por carga de siempre: F-005 CA27, F-008 CA4, F-015 CA5); `tools/revisar --base main` limpio.

## Presupuestos
Sin cambios en el servidor (el catálogo se elige una vez, al cargar las vistas). `public-scan --history`: menos de 60 s en este repo.

## Seguridad
Esta es la parte que **no puede fallar**. Ningún cambio de esta ficha llega a `main` hasta pasar las dos revisiones de la etapa H. Si una falla, se corrige y se repiten **las dos**.

**Revisión 1 · herramientas (falla cerrado):**
1. Lista de términos privados: `--tree` y `--history`.
2. gitleaks: sobre la historia (como el *pre-push*) **y** sobre el árbol de trabajo (`dir`), así entra lo que aún no tiene *commit*.
3. `public-scan --tree` y `--history` (R7).
4. trufflehog (D11) sobre el árbol y la historia, con `--network none --no-verification`.
5. La auditoría de la etapa 0 otra vez, sobre **todas** las ramas (CA0); una brecha dispara R23.
6. Inventario de lo que no es texto: cada imagen, sin metadatos (CA6), y una **hoja de contactos** (todas las imágenes en una página) para la revisión 2.
7. `git ls-files` comparado con `tools/never-commit.txt`: ninguna coincidencia.

**Revisión 2 · independiente:**
1. **Revisor con Sonnet**, modo «juicio», en un contexto limpio que **no** ve el informe de la revisión 1. Recorre todo archivo nuevo o cambiado con esta lista: ¿datos personales o de infraestructura?, ¿llaves o algo generado con ellas?, ¿ejemplos que parezcan reales?, ¿un documento que recomiende algo inseguro (HTTP sin TLS, escuchar fuera de `127.0.0.1`, permisos abiertos, `setInsecure`, desactivar la lista de aparatos)?, ¿el firmware o las herramientas pueden escribir una llave donde git la vea?
2. **El dueño** mira la hoja de contactos y la lista de archivos nuevos, y da el ok de publicación. Es la puerta 2 de esta ficha.

**Lo que no cambia y se comprueba igual:**
- [ ] Toda entrada externa con **límite de tamaño antes de parsear** (R14 para los PEM y R22 para `example-json`).
- [ ] Servicios locales solo en **127.0.0.1** (nada nuevo escucha; la guía no enseña otra cosa).
- [ ] Dependencias nuevas: ninguna en npm; la imagen de trufflehog (D11), fijada por *digest*.

## Archivos
**A crear:** `LICENSE`, `NOTICE`, `SECURITY.md`, `SECURITY.es.md`, `CONTRIBUTING.md`, `CONTRIBUTING.es.md`, `README.es.md`, `docs/guide/{en,es}/*.md`, `docs/guide/images/`, `docs/hardware/tintero-buttons/`, `firmware/{platformio.ini,src/,include/secrets.h.example}`, `server/src/engine/i18n/{index,es,en}.ts`, `server/src/integrations/example-json.ts` (D8), `config/example-json.*.example.json` (D8), `config/hoy.views.example.en.json` y `config/hoy.data.example.en.json` (A3), `tools/lib/public-scan.ts`, `tools/never-commit.txt`, `tools/public-scan-allow.txt`, `tools/imagenes-guia`.
**A tocar:** `README.md`, `package.json` (licencia), `.gitignore`, `firmware/README.md`, `server/scripts/pki.ts`, `server/README.md`, `server/src/engine/dates.ts` y los bloques con texto fijo, `server/src/views.ts` (la clave `locale`), `tools/git-hooks/pre-commit`, `tools/revisar`, `tools/images.conf` (D11), `docs/configuracion-local.md`, `docs/README.md`, `CLAUDE.md` (regla de idioma, D2), sus `*.test.ts`.
**Verificador:** `tests/acceptance/F-018/`.
**Arquitecto:** ADR de D1 a D11 (D10 con la excepción de R23 a ADR-0022); `docs/seguridad.md` (el modelo de amenazas resumido, en inglés, sale de aquí).
**Dueño:** D9 (ajustes de GitHub), CA12b (grabar y mirar el panel), la hoja de contactos y el ok de publicación.

## Resultado esperado
Una persona que llega al repo por GitHub entiende en inglés qué es Tintero, lo ve funcionando con el emulador en minutos sin hardware, puede armar el circuito y grabar el firmware, genera sus propios certificados sin que una llave se acerque a git, y sabe cómo escribir una integración. Y en el repo no queda nada del dueño, de su casa ni de su infraestructura (salvo su correo como autor de los *commits*, por decisión suya), ni en los archivos de hoy ni en la historia: lo comprueban dos revisiones independientes.

## Terminado (se marca al cerrar)
- [x] Todos los CA pasan en la verificación (informe adjunto).
- [x] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [x] `tools/check-scope` limpio para cada rol.
- [x] Las dos revisiones de seguridad de la etapa H, limpias (falta la mirada del dueño a la hoja de contactos).
- [x] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones se actualizan al cierre.
- [ ] El dueño aprobó integrar y publicar.

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos.
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

*(Sin referencia medida para C: CA8 pide las imágenes de hoy byte a byte y CA9 y CA10b se comprueban con texto, no con píxeles. Pruebas anteriores que cambian: ninguna esperada, porque `es` es el valor por defecto.)*

---

## Resultado obtenido
- **Etapa 0 (historia):** sin brechas en las 50 ramas públicas. La revisaron la lista de términos privados, gitleaks, un barrido propio y trufflehog sin red y sin verificación. No hubo nada que quitar (R23 no se usó).
- **Arquitecto (`arq/F-018`):** `tools/lib/public-scan.ts` (R7), `never-commit` en el *pre-commit* (R5), trufflehog 3.99.7 en `tools/revisar` (R8, D11), `tools/revision-publicacion` (revisión 1 y hoja de contactos), `tools/imagenes-guia` (R21), el diagrama de la guía y la regla de idioma de `CLAUDE.md`. Prueba en negativo: una llave plantada la atrapan gitleaks, `public-scan` y trufflehog. Las pruebas de aceptación encontraron tres defectos del escáner: un enlace simbólico, dos modos a la vez y un archivo borrado que seguía en el índice. Se corrigieron, y también el mismo caso del enlace en `private-terms.ts`.
- **Circuito (F):** `docs/hardware/tintero-buttons/`, hecho con el agente `circuit-layout` (Sonnet) por la línea de comandos del kit. `review` APPROVED y la red, revisada aparte, igual a R17 (CA17). Huecos del kit anotados: `layout` no coloca el DESPI-C02 ni con `pins`, el DevKit queda en la fila a y `suggest` se traba con dos cables.
- **Programador:**
  - Vuelta 1: C, D, E y D8. **Decisión de seguridad del arquitecto:** una sola pantalla por archivo de certificados. Antes cada ESP32 llevaba las llaves de todas las pantallas.
  - Vuelta 2: la documentación A y G.
  - Vuelta 3: las iniciales de los días en el catálogo y `firmware/README` en los dos idiomas.
  - Vuelta 4: las mejoras de la revisión: el temporal con la llave, el puerto del emulador y `--no-verify`.
- **Firmware (CA12a):** compila limpio en un contenedor con PlatformIO 6.1.18 y una PKI de prueba, con el mismo tamaño que el original (61,8 % de la *flash*, 33,2 % de la RAM). **CA12b** (grabarlo y mirarlo en el panel) queda para el dueño.
- **Verificación:**
  - 147 de 147 pruebas de F-018. En todo el lote, 893 de 894: F-005 CA27 falla por carga y pasa sola (79 de 79).
  - Se corrigieron pruebas que contradecían la ficha: CA9 (títulos), CA13 (la cabecera ASN.1 es común a toda llave P-256), CA21 (aclarado el contrato) y dos de `legal`.
  - **CA20:** un agente sin la configuración del dueño siguió solo la guía y llegó a `today` con el emulador, y a una despertada completa por mTLS.
- **Revisión:** `tools/revisar --base main` sale limpio en sus 16 herramientas, con zonas sensibles, y la revisión 1 de publicación, limpia. La revisión 2 (revisor Sonnet independiente): **aprobado con mejoras**, sin bloqueantes. Se hicieron la del temporal y la de `--no-verify`. El correo de los *commits* es D10. La pista de lugar en los ejemplos la decide el dueño.
- **Mejoras anotadas:**
  - Los datos de ejemplo en español traen el desfase `-05:00`, festivos `CO` y frases de rutina. Son públicos desde fichas anteriores y las pruebas de píxeles dependen de ellos.
  - Los comentarios en español que citan textos del catálogo.
  - Los huecos del kit de circuitos.
  - El firmware imprime la hora por serie en UTC.
- **Cambio de la puerta 2 (R18b, R21b, CA18b):** `README.md` gana «How it works» en inglés: el diagrama, la galería `today`/`board`/`agenda`, los dos botones y el circuito. `README.es.md` tiene el mismo apartado en español. Hay ejemplos en inglés de `tablero` y `agenda`, y `tools/imagenes-guia` dibuja las tres vistas en `-en` y `-es` (sale `calibracion.png`). Vuelta 5 del programador; pruebas de CA18b, con una prueba en negativo: una imagen `-es` en `README.md` hace fallar CA18b. Quedan 155 de 155 pruebas de F-018, `tools/revisar` limpio y la revisión de publicación limpia.
- **Costo en agentes:** USD 10,24 (programador 5,96; verificador 3,67; revisor 0,55; integrador ~0,06). No incluye los agentes del circuito ni de la prueba de humo, ni la sesión principal.

## Resumen para aprobar
## Para aprobar · F-018 · El repositorio, listo para que otra persona lo use

**Qué cambió:**
- Licencia MIT y la documentación pública en inglés y español: README (con «How it works» e imágenes en inglés), guía, SECURITY y CONTRIBUTING.
- Las vistas en inglés o español, y el firmware en el repo con certificados de una sola pantalla.
- El circuito de los botones y una plantilla de integración.
- Controles que impiden publicar datos privados o llaves, más una revisión doble.

**Criterios:** 155 de 155 pruebas de F-018. CA0, CA12a, CA17 y CA20 los comprobó el arquitecto; CA12b queda para el dueño. Vueltas: programador 5 (la 5, el cambio de la puerta 2), verificación 2, revisión 1.

**Revisión:** herramientas limpias; revisor independiente con 4 mejoras, ninguna bloqueante (2 hechas, 2 para el dueño). Zonas sensibles: `tools/`, `CLAUDE.md`, `package.json` (solo la licencia), `server/scripts/pki.ts`.
**Dependencias nuevas:** ninguna en npm; la imagen de trufflehog fijada por *digest*.

**Riesgos o pendientes:**
- Mirar la hoja de contactos.
- CA12b: grabar el firmware nuevo, que cambia los certificados a una sola pantalla: hay que regenerar `tintero_certs.h` con `npm run pki -- firmware`.
- D9: los ajustes de GitHub.

**Decisión que se pide:** integrar `ver/F-018` a `main` y subirlo.
