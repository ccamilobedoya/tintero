# F-004 · Exposición con certificado por pantalla (L1)

**Estado:** **aprobada** · el dueño aprobó D1–D5 el 2026-10-23 (D6 se decide en CA10)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna (TLS con `node:https`/`node:tls`; certificados con la CLI `openssl` del sistema, llamada sin *shell*).

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta | Por qué |
|---|----------|-----------|---------|
| **D1** ✅ | ¿Quién termina el TLS? | **El propio servidor (Fastify con `https`)**, con `requestCert` y `rejectUnauthorized`; Funnel en modo **`--tcp`** solo reenvía bytes (no `--tls-terminated-tcp`, que terminaría el TLS antes y el servidor no vería el certificado del aparato) | Una pieza menos que un proxy; el servidor ve el certificado del aparato y lo usa como identidad (ADR-0007: probar L1 primero) |
| **D2** ✅ | ¿Cómo se hacen los certificados? | **Autoridad privada de Tintero** con la CLI `openssl`: una CA y un certificado por pantalla, **ECDSA P-256** (mbedTLS del ESP32 lo soporta y el saludo es más corto que con RSA). Vigencias: CA 10 años, pantalla 5 años, servidor 2 años. Todo **fuera del repo** (carpeta 700, llaves 600) | Estándar; el ESP32 lleva su certificado y su llave; revocar no depende de la vigencia (D3) |
| **D3** ✅ | ¿Cómo se identifica cada pantalla? | Por la **huella SHA-256 de su certificado**, en una **lista de aparatos** (archivo fuera del repo). Revocar = quitar su línea; el servidor relee el archivo si cambió, **sin reiniciar** | Simple y revocable sin reemitir nada |
| **D4** ✅ | ¿Cómo se prueba? | **Primero en local** (HTTPS en 127.0.0.1 con certificados generados en cada prueba, en carpetas temporales fuera del repo): todo lo automatizable. **Después, una prueba en vivo por Funnel** (CA10), manual: la corre el arquitecto con el ok del dueño. **No hace falta `sudo`**: el usuario del servidor ya es operador de Tailscale (verificado) | La infraestructura real no la tocan los agentes |
| **D5** ✅ | ¿Qué certificado presenta el **servidor**? | **(b) Uno firmado por la misma CA privada**, con el nombre público del servidor. El aparato confía **solo** en esa CA | Ver *Lo verificado*: el certificado público cambia de cadena y vence a los 90 días; con `--tcp`, Funnel no mira el certificado (**comprobado en vivo**) |
| | Alternativa | **(a) El público de Let's Encrypt** vía `tailscale cert` | Renovar cada ≤ 90 días (Let's Encrypt anunció bajar a 45) y recargarlo en caliente; el ESP32 necesita el paquete de raíces públicas y recibe una cadena de 4 certificados en **cada** despertada (más radio, más batería); en 2026 la cadena ya cambió de jerarquía (Generación Y) y puede volver a cambiar |
| **D6** *(nueva)* | ¿Cómo se mantiene **publicado el nombre público**? | **(a) Otro puerto de Funnel queda siempre en modo HTTPS**: el servicio *on-demand* que ya existe en el servidor deja su puerto siempre en Funnel; «cerrado» = una respuesta de texto fija sin nada detrás, «abierto» = el servicio. Cambio de infraestructura **fuera del repo** (lo hace el arquitecto con el ok del dueño; lo que pida `sudo`, el dueño) | En la prueba, con **solo** Funnel `--tcp` el nombre no apareció en el DNS público; apareció al abrir un Funnel HTTPS. Funnel solo permite 3 puertos y no hay uno libre para un HTTPS propio de Tintero. **El mecanismo no está confirmado** (ver *Lo verificado*): D6 **no se decide en la puerta 1**, sino con la observación de CA10. El código de F-004 no depende de D6 |
| | Alternativas | (b) Liberar el puerto 443 (hoy lo usa un servicio solo de la red privada) para un HTTPS fijo; (c) renunciar a L1: Funnel HTTPS termina el TLS y no pasa el certificado del aparato → L2 (ADR-0007) | (b) cambia la dirección de un servicio en uso; (c) pierde la identidad por certificado |

## Lo verificado por el arquitecto (2026-10-23)
- [x] **Funnel `--tcp` existe** en la versión instalada de Tailscale (1.102): `tailscale funnel --bg --tcp 8443 tcp://127.0.0.1:<puerto>`; se apaga con `tailscale funnel --tcp=8443 off`. Hay también `--proxy-protocol` (para saber la IP del aparato): **no** se usa en F-004.
- [x] **No hace falta `sudo`** para `tailscale funnel` ni para `tailscale cert` (operador de Tailscale). Esto corrige la última frase de ADR-0007 («activar Funnel pide permisos de administrador»).
- [x] **El servicio que reiniciaba Funnel al arrancar ya no lo hace**: ahora solo cierra su propio puerto. El puerto 8443 está libre (detalle en la nota privada).
- [x] **`tailscale cert`** entrega un certificado de Let's Encrypt **ECDSA P-256 de ~90 días**; se renueva volviendo a correrlo. Solo importa si se escoge D5 (a).
- [x] **Node 24 valida** hoy el certificado público (llega a ISRG Root X1/X2 por las firmas cruzadas; la raíz nueva *Root YE* aún no está en su almacén). Con D5 (b), el emulador usa `--ca` y no depende de eso.
- [x] **ESP32** (sin probar en la placa: va al curso del dueño): con (b), `setCACert(<CA de Tintero>)` + `setCertificate` + `setPrivateKey` en `WiFiClientSecure` (o lo equivalente en ESP-IDF); con (a), el paquete de raíces (`esp_crt_bundle` / `setCACertBundle`).
- [x] **Prueba en vivo (2026-10-23)** con certificados desechables, un `openssl s_server` que exige certificado de cliente y Funnel `--tcp` en 8443: con certificado bueno → **200** a través del *relay* público; sin certificado → el servidor corta el saludo (`certificate required`); con certificado de otra CA → `unknown ca`. El certificado que llega por Funnel es el de la **CA de prueba**, no el público: **el *relay* no termina el TLS**. D1 y D5 (b) son viables.
- [x] **DNS público:** con **solo** Funnel `--tcp` activo, el nombre **nunca** apareció (11 min, consultando directamente los servidores autoritativos, 66 veces). Con un Funnel **HTTPS** activo en otro puerto, apareció en ~1 min y tardó ~2 min más en asentarse (respuestas alternadas entre copias del servidor autoritativo). Pero **siguió publicado al menos 10 min después de cerrar** ese Funnel HTTPS, sin ningún reenvío activo. Dos explicaciones posibles: Tailscale publica el nombre solo con un Funnel HTTPS y lo borra tarde, o la primera publicación simplemente tardó ~20 min y coincidió. Se aclara con una observación larga (CA10) antes de decidir D6. Cada cambio de la configuración de Funnel puede dejar el nombre sin resolver unos minutos: el aparato reintenta en la siguiente despertada.
- [x] `tailscale funnel --tcp=8443 off` quita el reenvío pero deja el permiso de Funnel del puerto encendido, sin nada detrás (inofensivo; se limpia al cerrar la ficha).

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos (salvo CA10, manual).
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] Nombres de archivos, rutas, puertos y URLs escritos (puerto efímero en pruebas; nombre `localhost`; aparatos `p1`, `p2`, `x1`).
- [x] Toda función que se prueba tiene nombre y firma; el límite de paneles cuenta **desde que arranca el servidor**.

## Contexto
ADR-0007 decidió exponer la API de aparatos por Tailscale Funnel con una capa «solo mis aparatos», probando primero **L1 (certificado de cliente)**. Esta ficha lo implementa y lo prueba. Incluye las mejoras **obligatorias** que dejó la revisión de F-003.

## Alcance
- Modo HTTPS del servidor con certificado de cliente obligatorio (L1) y lista de aparatos (L3: no listado → 404 vacío).
- `npm run pki`: crear la CA, emitir certificados de servidor y de pantalla (CLI `openssl`), todo fuera del repo.
- Emulador: opciones TLS (`--ca`, `--cert`, `--key`).
- **De F-003 (obligatorio):** caché con expulsión del menos usado (nunca se vacía entera) y **límite de paneles distintos por aparato**; `requestTimeout`, `maxConnections` y tiempo máximo del saludo TLS.
- Prueba en vivo por Funnel (CA10, manual, anotada en el resultado).

**Fuera de alcance:** L2 (firma HMAC; solo si L1 no funciona); renovación automática del certificado del servidor (con D5 b dura 2 años; se reemplaza a mano y se reinicia); la web de configuración; varios usuarios; estado por aparato (la demostración sigue compartida); base de datos; servicio de systemd o Docker para dejarlo corriendo (otra ficha).

## Requisitos
- R1. Código en `server/src/` y `server/scripts/`, con pruebas unitarias; lo de F-003 no cambia de comportamiento sin TLS.
- R2. `server/README.md` y `emulator/README.md`: cómo crear la CA y los certificados y cómo arrancar con TLS (con nombres de ejemplo, nunca los reales).

## Contrato

### Arranque (`server/src/main.ts`)
```
npm run server -- [opciones de F-003] [--tls-cert F --tls-key F --client-ca F --devices F] [--max-panels N (2)] [--max-connections N (32)]
```
- Las cuatro opciones TLS van **juntas**: si falta alguna, o un archivo no se puede leer, sale con **2** sin escuchar.
- Con TLS: escucha **HTTPS** en `127.0.0.1:<puerto>` (Funnel `--tcp` reenvía a 127.0.0.1; **nunca** se escucha en otra dirección, con o sin TLS). Primera línea: `{"listening":"https://127.0.0.1:<puerto>"}`.
- Sin TLS: igual que F-003 (HTTP, solo 127.0.0.1, `--host` distinto → 2). Todas las peticiones cuentan como un único aparato `local`.
- Opciones TLS de Node: `requestCert: true`, `rejectUnauthorized: true`, `ca` = la CA de aparatos, `minVersion: "TLSv1.2"`, `handshakeTimeout` **10 s**.
- Servidor: `requestTimeout` **15 s**, `maxConnections` (por defecto 32), `headersTimeout` y `maxHeaderSize` como en F-003.

### Interfaz para pruebas (`server/src/index.ts`)
Se mantiene la de F-003 y se agrega:
```ts
export interface TlsConfig { certFile: string; keyFile: string; clientCaFile: string; devicesFile: string }
export interface ServerConfig {
  nextWakeS: number; headersTimeoutMs: number;
  requestTimeoutMs?: number;     // 15000
  handshakeTimeoutMs?: number;   // 10000
  maxConnections?: number;       // 32
  maxPanelsPerDevice?: number;   // 2
  tls?: TlsConfig;
}
export function fingerprint(certDer: Uint8Array): string; // SHA-256 del DER, 64 hex en minúscula, sin «:»
```

### Lista de aparatos (`--devices`)
- Texto UTF-8, **≤ 64 KiB** (más grande → se trata como ilegible). Una línea por aparato: `<huella> <id>`; `huella` = 64 hex en minúscula; `id` = `[a-z0-9-]{1,32}`, única. Líneas vacías y las que empiezan con `#` se ignoran.
- Se relee cuando cambia su fecha de modificación o su tamaño (comprobado en cada petición).
- **Falla cerrado:** si el archivo no se puede leer, pasa de 64 KiB o tiene una línea inválida, **ningún** aparato está listado (todo responde 404 vacío) y se registra una línea `{"ts","devices_error":"<motivo corto>"}` sin el contenido del archivo. Al volver a ser válido, se recupera solo.
- La identidad de la petición es el `id` del aparato. El registro (S6) agrega el campo `"device": "<id>"` (o `null` si no está listado).

### Límite de paneles y caché
- Cada aparato puede usar como mucho `maxPanelsPerDevice` paneles distintos (`w,h,dpi,depth`) desde que arranca el servidor. Un panel nuevo por encima del límite → **400** `invalid_request`, **sin dibujar** nada.
- La caché de dibujos sigue con **48** entradas, pero al llenarse **expulsa la menos usada recientemente** (una por vez); nunca se vacía entera.

### Certificados (`npm run pki -- …`, en `server/scripts/pki.ts`)
```
pki init   <carpeta>                # CA: ca.key, ca.crt
pki server <carpeta> <nombre-dns>   # server.key, server.crt (SAN = nombre-dns), firmado por la CA
pki device <carpeta> <id>           # devices/<id>.key, devices/<id>.crt; imprime la línea «<huella> <id>» para la lista
```
- `openssl` con `execFile` (sin *shell*), argumentos validados (`id` como en la lista; `nombre-dns` = nombre DNS válido, ≤ 253).
- Crea la carpeta con **700** y las llaves con **600**; **se niega** (sale con 2, sin escribir nada) si la carpeta queda dentro del repositorio (comparando rutas reales) o si un archivo de destino ya existe.
- ECDSA P-256; vigencias de D2; certificados de pantalla con `extendedKeyUsage = clientAuth`; el del servidor con `serverAuth`.

Funciones (las usan la CLI y las pruebas; la CLI sale con **2** si una función rechaza):
```ts
// server/scripts/pki.ts — la CLI solo corre con import.meta.main
export function pkiInit(dir: string): Promise<void>;                    // <dir>/ca.key, <dir>/ca.crt
export function pkiServer(dir: string, dnsName: string): Promise<void>; // <dir>/server.key, <dir>/server.crt
export function pkiDevice(dir: string, id: string): Promise<string>;    // <dir>/devices/<id>.key y .crt; devuelve «<huella> <id>»
```
Las tres **rechazan** (sin escribir nada) en los casos de arriba; `pkiServer` y `pkiDevice` rechazan también si la CA de `<dir>` no existe.

### Emulador
- `EmulatorConfig` agrega `tls?: { caFile: string; certFile: string; keyFile: string }`. Con `tls` y una URL `https://`, `runWake` y `press` validan al servidor con esa CA (y **solo** esa: reemplaza las raíces públicas) y presentan el certificado.
- CLI: `--ca F`, `--cert F`, `--key F` llenan `tls`. Las tres van juntas; con `http://`, o si falta alguna, sale con **2**.

## Criterios de aceptación
Las pruebas generan con `pkiInit`/`pkiServer`/`pkiDevice` dos CA en una carpeta temporal **fuera del repo**: la buena (servidor `localhost`, pantallas `p1` listada y `p2` no listada) y otra CA con su pantalla `x1`. Arrancan con `startServer(config, 0)`. Todo se borra al terminar.

- **CA1.** Con TLS, `npm run server -- --port 0 …` imprime `{"listening":"https://127.0.0.1:<puerto>"}`. Un `tls.connect` **sin** certificado de cliente falla en el saludo (error de TLS o conexión cerrada) y **no** recibe ningún byte de HTTP.
- **CA2.** Con el certificado de `x1` (otra CA), el saludo falla igual.
- **CA3.** Con `p2` (CA buena, no listada): `GET /api/v1/index` con cabeceras válidas, `POST /api/v1/actions` y `GET /` responden **404 sin cuerpo**; el registro lleva `"device": null`.
- **CA4.** Con `p1`, `runWake` del emulador (con `ca`, `cert`, `key`) descarga las tres vistas sin errores; el registro lleva `"device": "p1"`. Por la CLI: `npm run emulator -- --server https://localhost:<puerto> --ca … --cert … --key … --wakes 1` termina con 0.
- **CA5.** Con el servidor corriendo, quitar la línea de `p1` de la lista → la siguiente petición de `p1` responde 404 vacío; volver a ponerla → 200. Sin reiniciar.
- **CA6.** Lista inválida (una línea con huella de 63 caracteres) → `p1` recibe 404 vacío y el registro tiene una línea `devices_error`; corregirla → 200.
- **CA7.** `pki`: `init`, `server` y `device` crean los archivos con llaves **600** y carpeta **700**; `device` imprime una línea que coincide con `fingerprint()` del certificado; con una carpeta dentro del repo, o con un archivo que ya existe, sale con 2 y no escribe nada; `id` = `../x` → sale con 2.
- **CA8.** Con `maxPanelsPerDevice: 2`: dos paneles distintos de `p1` → 200; un tercero → **400** `invalid_request` y `renders()` no aumenta. Con la caché llena (48 entradas), pedir una entrada nueva expulsa solo la menos usada: la usada más recientemente se sirve sin redibujar.
- **CA9.** Con `requestTimeoutMs: 1000`, un `POST` que manda su cuerpo de a un byte por segundo se corta en **menos de 3 s**. Con `maxConnections: 2`, una tercera conexión abierta a la vez se cierra sin respuesta HTTP. Con `handshakeTimeoutMs: 1000`, un cliente TCP que abre y no saluda queda cerrado en menos de 3 s.
- **CA10 (manual, arquitecto con ok del dueño).** Prueba en vivo: Funnel `--tcp` en 8443 hacia el servidor con TLS; el emulador con `p1` despierta contra la URL pública y termina con 0; sin certificado, el saludo falla; con `p2`, 404. Con solo la configuración permanente de Tintero (más lo que decida D6), el nombre público resuelve durante **24 h** seguidas, consultado cada 5 min en los servidores autoritativos; según el resultado se decide D6. Se apaga Funnel al terminar. Resultado anotado en la ficha (sin nombres ni direcciones).
- **CA11.** Sin TLS, lo de F-003 sigue igual: `--host 0.0.0.0` sale con 2, y las pruebas de aceptación de F-003 pasan.
- **CA12.** Opciones TLS incompletas (solo `--tls-cert`) o un archivo que no existe → sale con 2 sin escuchar. Emulador con `--cert` y una URL `http://` → sale con 2.

## Presupuestos
- Saludo TLS + `GET /api/v1/index` en local: **< 100 ms**.
- Releer una lista de 100 aparatos: **< 5 ms**.

## Seguridad
- [ ] Toda entrada externa con límite de tamaño antes de parsear (cuerpos, cabeceras, lista de aparatos ≤ 64 KiB).
- [ ] Solo 127.0.0.1, con o sin TLS; desde afuera solo se llega por Funnel `--tcp` y con certificado de cliente.
- [ ] `openssl` sin *shell* y con argumentos validados; nada se escribe dentro del repo.
- [ ] Dependencias nuevas: ninguna.
- Llaves, certificados, lista de aparatos y nombres del servidor: **fuera del repo** (ADR-0023). En las pruebas, el nombre es `localhost`.

## Archivos
- A crear: `server/src/tls.ts` (opciones TLS, huella), `server/src/devices.ts` (lista de aparatos), `server/scripts/pki.ts` y sus `*.test.ts`.
- A tocar: `server/src/{app,index,main,args,log}.ts`, `emulator/src/{cli,config,http}.ts`, `server/README.md`, `emulator/README.md`, `package.json` (script `pki`), `knip.json`.
- Del arquitecto, al aprobar: ADR de D1–D6 y nota en ADR-0007 sobre los permisos. Fuera del repo (D6): el cambio de la otra puerta de Funnel, con el ok del dueño.

## Resultado esperado
Con la CA y un certificado de pantalla creados con `npm run pki`, el servidor con TLS y el emulador con su certificado hacen el ciclo completo; sin certificado, o con uno no listado, no hay nada que ver. Y lo mismo desde internet por Funnel.

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto).
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
