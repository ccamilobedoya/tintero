# F-012 · La pantalla real llega al servidor (Funnel en un nodo propio)

**Estado:** **aprobada la opción A** por el dueño el 2026-10-25 («Funnel aparte en un nodo propio»); D1–D5 son el detalle de esa opción. Se hace después de F-010. **Tiene pasos del dueño** (consola de Tailscale y token de Trilium): ver *Pasos del dueño*.
**Modelo del programador:** no hay programador (no cambia código del servidor): las plantillas y el instalador los escribe el arquitecto, el verificador prueba las plantillas, y los CA en vivo los corren el arquitecto y el dueño.
**Dependencias nuevas permitidas:** ninguna de npm; una **imagen de contenedor** nueva, `tailscale/tailscale`, fijada por *digest* en `tools/images.conf`.

## Decisiones

| # | Decisión | Aprobado |
|---|----------|----------|
| **D1** ✅ | Un nodo de Tailscale propio para Tintero | Un contenedor `tailscale/tailscale` se une al tailnet como **otro aparato**, `tintero`, con la etiqueta `tag:tintero` (los aparatos etiquetados no vencen; el plan gratis trae 50). El Funnel se abre **en ese nodo**: solo se publica en DNS `tintero.<tailnet>.ts.net` y el nombre del servidor de la casa **sigue sin publicarse**, así Trilium y Outline desde el celular no se rompen (incidente del 2026-10-24). Reemplaza el «puerto libre del servidor» de ADR-0007 y fija la URL de ADR-0008. **→ ADR-0047** |
| **D2** ✅ | Cómo corre ese nodo | Modo **userspace** (no crea interfaz de red, no toca el DNS ni el Tailscale del servidor), `network_mode: host` (para reenviar a `127.0.0.1`), puerto UDP automático (`--port=0`, para no chocar con el Tailscale del servidor), `TS_ACCEPT_DNS=false`, estado en una carpeta propia (la identidad sobrevive a reinicios), sin capacidades, `no-new-privileges`, `restart: unless-stopped`. |
| **D3** ✅ | Qué publica | Funnel **TCP en el 443** del nodo `tintero`, reenviado tal cual a `127.0.0.1:<puerto TLS de Tintero>`: el TLS y el certificado de cliente los sigue terminando Tintero (ADR-0028, probado en vivo en F-004). Nada más en ese nodo. La pantalla usa `https://tintero.<tailnet>.ts.net` (puerto 443). |
| **D4** ✅ | Certificados | La CA privada de ADR-0029 se crea ahora (`npm run pki -- init`), con el certificado del servidor para `tintero.<tailnet>.ts.net` y uno por pantalla (`p1` la primera). La llave de la CA va al respaldo cifrado (restic) y a ningún otro lado. |
| **D5** ✅ | Quién abre el Funnel | Abrir algo a internet **lo hace el dueño** (regla 9 de `docs/PROCESO.md`): el arquitecto deja todo listo y el dueño corre un solo comando (`docker compose up -d` en la carpeta del nodo). Cerrar: `docker compose down`. |

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos (los reales, fuera del repo).
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto
El ESP32 no puede correr Tailscale y el servidor solo escucha en `127.0.0.1`. ADR-0007/0008 pedían Funnel, pero cualquier Funnel en el servidor de la casa publica su nombre en DNS público y rompe los servicios que solo viven en el tailnet (2026-10-24). Un nodo de Tailscale aparte, solo para Tintero, publica su propio nombre y deja el del servidor en paz. Esta ficha conecta todo: nodo, Funnel, CA real, servicio de F-010 con TLS y la configuración real, hasta que el emulador entra por la URL pública como lo hará la pantalla.

## Alcance
Plantillas del nodo (`deploy/funnel/`), instalador, imagen fijada, CA y certificados reales, configuración real (fuera del repo), servicio con TLS, comprobaciones en vivo, entrega al firmware.

**Fuera de alcance:** el firmware (lo escribe el dueño, ADR-0013); F-011; cifrado de la flash del ESP32 (L6); más pantallas que `p1` (se agregan igual, con `npm run pki -- device`).

## Pasos del dueño
1. **Política de Tailscale** (consola de Tailscale → *Access controls*). Agregar, sin quitar lo que ya hay (el `funnel` de los miembros lo usa la puerta de Jellyfin):
   ```jsonc
   "tagOwners": { "tag:tintero": ["autogroup:admin"] },
   "nodeAttrs": [
     { "target": ["tag:tintero"], "attr": ["funnel"] }
     // …las entradas que ya existan siguen aquí
   ]
   ```
   Si la política tiene reglas de acceso restringidas (no el «todo permitido» por defecto), agregar también que el servidor pueda llegar a `tag:tintero:443` (para las pruebas desde la casa).
2. **Llave de acceso** (consola → *Settings* → *Keys* → *Generate auth key*): no reutilizable, **no efímera**, preaprobada, con la etiqueta `tag:tintero`, vencimiento de 1 día (solo sirve para el primer ingreso). Guardarla en el servidor en el archivo que diga el arquitecto, con permisos 600 (el arquitecto da el comando exacto). Si es más cómodo, pasársela al arquitecto: vence en un día y deja de servir apenas el nodo entra.
3. **Token de Trilium para Tintero** (Trilium → *Opciones* → *ETAPI* → *Crear token*, nombre `tintero`), guardado igual, en el archivo que diga el arquitecto (`server/README.md`, F-009).
4. **Abrir el Funnel** cuando el arquitecto avise: `docker compose up -d` en la carpeta del nodo (un comando). Para cerrarlo: `docker compose down`.
5. **Probar desde el celular** que Trilium sigue abriendo, con el Funnel encendido (CA6).

## Contrato

### Plantillas (`deploy/funnel/`, las escribe el arquitecto)
- `compose.yaml.in`: servicio `tintero-funnel`, imagen `@TAILSCALE_IMAGE@` (de `tools/images.conf`), `network_mode: host`, `restart: unless-stopped`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, `read_only: true` con `tmpfs` para `/tmp` y `/var/run/tailscale`. Entorno: `TS_HOSTNAME=tintero`, `TS_USERSPACE=true`, `TS_ACCEPT_DNS=false`, `TS_AUTH_ONCE=true`, `TS_STATE_DIR=/var/lib/tailscale`, `TS_EXTRA_ARGS=--advertise-tags=tag:tintero`, `TS_TAILSCALED_EXTRA_ARGS=--port=0`, `TS_SERVE_CONFIG=/config/serve.json`, y `TS_AUTHKEY` leída de un archivo (`TS_AUTHKEY=file:/run/secrets/authkey` o el mecanismo equivalente de la imagen, montado de solo lectura). Volúmenes: `./state:/var/lib/tailscale`, `./config:/config:ro` (la carpeta, no el archivo, como pide la imagen).
- `serve.json.in`: `{"TCP": {"443": {"TCPForward": "127.0.0.1:@TINTERO_TLS_PORT@"}}, "AllowFunnel": {"${TS_CERT_DOMAIN}:443": true}}`.
- `tools/instalar-funnel [--dry-run]`: lee `TINTERO_FUNNEL_DIR`, `TINTERO_TLS_PORT` (1024–65535) y `TINTERO_AUTHKEY_FILE` de la configuración local; mismas reglas que `tools/instalar-servicio` (≤ 16 KiB, sin saltos ni `@`, sale con 2 y nombra la clave que falta). Escribe la carpeta del nodo (700) con `compose.yaml` y `config/serve.json` (600). **No** arranca nada. Con `--dry-run` imprime los dos archivos.

### Servicio con TLS (F-010 + F-004)
`TINTERO_ARGS` real: `--instance servicio --port <TINTERO_TLS_PORT> --tls-cert … --tls-key … --client-ca … --devices … --views … --data … --integrations …` (todo fuera del repo). Las opciones ya existen; esta ficha no cambia el servidor.

## Criterios de aceptación
- **CA1 (plantillas).** `tools/instalar-funnel --dry-run` con una configuración local de prueba (`TINTERO_FUNNEL_DIR=/tmp/f`, `TINTERO_TLS_PORT=8443`, `TINTERO_AUTHKEY_FILE=/tmp/k`) imprime un `compose.yaml` con `network_mode: host`, `cap_drop` con `ALL`, `no-new-privileges:true`, `TS_USERSPACE=true`, `TS_ACCEPT_DNS=false`, `TS_HOSTNAME=tintero`, `--advertise-tags=tag:tintero`, `--port=0`, una imagen con `@sha256:`, y un `serve.json` cuyo `TCPForward` es `127.0.0.1:8443` y con `AllowFunnel` solo para el 443; sin marcadores `@…@`; no escribe nada. Sin `TINTERO_TLS_PORT` → 2 y la nombra; `TINTERO_TLS_PORT=80` → 2.
- **CA2 (nodo en el tailnet, en vivo).** Tras el paso 4 del dueño: `tailscale status` en el servidor muestra `tintero` con `tag:tintero`, y el servidor sigue con su propio Tailscale sin cambios (`tailscale status` antes y después: mismas IP y nombre).
- **CA3 (DNS, en vivo).** Consultando **los servidores autoritativos** (no un resolver con caché): `tintero.<tailnet>.ts.net` resuelve; el nombre del servidor de la casa da **NXDOMAIN**. Se mira a los ≥ 10 min de abrir y otra vez al día siguiente.
- **CA4 (camino público, en vivo).** Desde el servidor, por la URL pública (DNS público, no MagicDNS), el emulador con el certificado de `p1` recibe un índice y una imagen `raw1` con CRC32 correcto; sin certificado → el saludo TLS falla (`certificate required`); con un certificado válido de una pantalla no listada → 404 vacío.
- **CA5 (Funnel del servidor intacto).** `health-check` del homelab sigue sin avisos: el `AllowFunnel` del servidor solo tiene lo de siempre (`:10000`).
- **CA6 (celular, lo corre el dueño).** Con el Funnel de `tintero` encendido, Trilium abre desde el celular.
- **CA7 (reinicio).** Tras reiniciar el contenedor del nodo (y, cuando el dueño reinicie la máquina, tras el reinicio), el nodo vuelve **sin pedir llave** y CA4 sigue pasando.

## Presupuestos
Una imagen `raw1` de 800 × 480 son unos 48 KB: muy por debajo de los límites de ancho de banda de Funnel. Tiempo de una petición completa por el relay: se mide en CA4 y se anota.

## Seguridad
- [ ] El nodo `tintero` solo publica el 443 hacia `127.0.0.1:<puerto TLS>`; Tintero exige certificado de cliente (L1) y calla ante extraños (L3).
- [ ] El nodo no toca el DNS ni la red del servidor (userspace, `TS_ACCEPT_DNS=false`); el nombre del servidor no se publica (CA3).
- [ ] La llave de acceso y el token de Trilium viven fuera del repo (600); la llave vence en un día y no se reutiliza.
- [ ] La llave de la CA solo en el respaldo cifrado; la de cada pantalla, solo en su ESP32 y en la carpeta privada de la PKI.
- [ ] Imagen nueva fijada por *digest*; contenedor sin capacidades y de solo lectura.
- [ ] Nada privado en el repo: plantillas con marcadores; nombres reales en la nota privada del proyecto.

## Archivos
**El arquitecto:** `deploy/funnel/{compose.yaml.in,serve.json.in,README.md}`, `tools/instalar-funnel` (+ prueba), `tools/images.conf` (imagen de Tailscale), `config/local.env.example` y `docs/configuracion-local.md` (claves nuevas), ADR-0047, `server/README.md` (cómo se publica), y fuera del repo: PKI, configuración real, carpeta del nodo.
**Verificador:** `tests/acceptance/F-012/` (CA1).

## Para el firmware (lo que el dueño necesita al terminar)
- URL: `https://tintero.<tailnet>.ts.net` (puerto 443). El nombre real, en la nota privada del proyecto.
- Confiar **solo** en `ca.crt` (la CA de Tintero); presentar `p1.crt` + `p1.key` (la llave no sale del ESP32).
- El protocolo: `contract/openapi/v1.json`, `contract/schema/v1/` y las reglas de F-001 (cabeceras obligatorias, `raw1` con CRC32, zonas, acciones con dos botones). El emulador (`emulator/`) es la referencia de comportamiento.

## Resultado esperado
El emulador, y después la pantalla, entran por `https://tintero.<tailnet>.ts.net` con su certificado y reciben sus vistas, sin publicar el nombre del servidor de la casa y sin que nada se rompa en el tailnet.

## Terminado (se marca al cerrar)
- [ ] CA1 pasa en la verificación; CA2–CA7 con su resultado en vivo.
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
