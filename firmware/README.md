# firmware

Firmware del ESP32 (C++, PlatformIO). Lo escribe el dueño del proyecto; los agentes solo ayudan si él lo pide (ADR-0013).

## Qué necesita el ESP32 para hablar con Tintero

Esta guía no tiene datos reales: el nombre público, las rutas y las llaves de cada pantalla viven fuera del repo (ADR-0023).

### 1. Archivos de la pantalla (los genera `npm run pki`, F-004/F-012)
- `ca.crt`: la CA privada de Tintero. El ESP32 confía **solo** en ella (no en las CA públicas).
- `pN.crt` y `pN.key`: el certificado y la llave de esa pantalla (ECDSA P-256, PEM). La llave **no sale del ESP32** (después, cifrado de la flash, L6).
- La línea `<huella> pN` de la pantalla tiene que estar en la lista de aparatos del servidor; si no, todo responde 404 vacío.

Con Arduino (`WiFiClientSecure`): `setCACert(ca)`, `setCertificate(crt)`, `setPrivateKey(key)`. Con ESP-IDF (`esp_http_client`): `cert_pem`, `client_cert_pem`, `client_key_pem`.

### 2. Antes del TLS: la hora
El certificado del servidor se valida con fechas. Sin hora (el ESP32 arranca en 1970) el saludo TLS falla. Sincronizar por SNTP **antes** de conectar (o guardar la última hora buena en el RTC del ESP32 entre despertadas).

### 3. Conexión
- `https://<nombre-público>/` en el puerto **443**. El nombre (SNI) tiene que ser el del certificado del servidor.
- **Una petición a la vez** (nunca en paralelo); se puede reusar la conexión dentro de una despertada.
- **Tiempos de espera en toda petición** (conexión y lectura; p. ej. 10 s y 20 s): si el servidor no responde, dormir y probar en la próxima despertada.
- **Límites antes de leer** (entrada externa): rechazar un `Content-Length` mayor que el esperado (índice ≤ 2048 bytes, zonas ≤ 4096, imagen = `bytes` del índice) y acotar `next_wake_s` a 30–86 400 s.

### 4. Cabeceras en **cada** petición
| Cabecera | Valor |
|----------|-------|
| `Tintero-Protocol` | `1` |
| `Tintero-Firmware` | texto, 1–32 caracteres (p. ej. `esp32-0.1`) |
| `Tintero-Power` | `battery` o `usb` |
| `Tintero-Formats` | `raw1` |
| `Tintero-Panel` | `w=800,h=480,dpi=124,depth=1` (GDEY075T7) |
| `Tintero-Battery-mV`, `Tintero-RSSI` | opcionales |

### 5. Una despertada
1. `GET /api/v1/index` → `current`, `views[]` (con `hash`, `bytes`, `crc32`), `panel`, `next_wake_s`.
2. Si el `panel` de la respuesta no es el que se declaró, no mostrar nada nuevo y volver en `next_wake_s`.
3. Por cada vista cuya `hash` cambió (empezando por `current`): `GET /api/v1/views/{id}/image?h={hash}` y `GET /api/v1/views/{id}/zones?h={hash}`. Comprobar que la imagen tiene **exactamente** `bytes` (48 000 en el panel actual) y su **CRC-32** (el de zlib) antes de guardarla o mostrarla.
4. Mostrar `current`; el foco (recuadro) lo dibuja el ESP32 con refresco parcial sobre las zonas (ADR-0006).
5. Las acciones hechas (también sin red) van juntas en `POST /api/v1/actions` (1–8, cada una con un `id` único: el servidor ignora repetidas).
6. Opcional: `POST /api/v1/log` con avisos cortos.
7. Dormir `next_wake_s` segundos.

### 6. Formato `raw1`
`ceil(ancho / 8) × alto` bytes; filas de arriba abajo, píxeles de izquierda a derecha, **bit más significativo primero**, **1 = negro**. Si el controlador del panel usa 1 = blanco, invertir los bytes al volcar.

### 7. Botones (ADR-0005)
- **Mover:** corto = siguiente zona (en el orden de `zones`); largo = siguiente vista (en el orden de `views`).
- **Aceptar:** corto = la acción de la zona (`toggle` marca/desmarca, `open` abre el detalle); largo = volver (en un detalle) o actualizar ya (en una vista).

### 8. Respuestas que hay que manejar
| Respuesta | Qué hacer |
|-----------|-----------|
| 404 sin cuerpo | la pantalla no está autorizada (o certificado ausente): revisar llaves y lista de aparatos |
| 409 `stale_view` / `stale_zone` | pedir otra vez el índice |
| 429 `too_many` / 503 `busy` | esperar `Retry-After` segundos y reintentar |
| 304 | la imagen no cambió (con `If-None-Match`) |
| fallo de TLS | revisar la hora, `ca.crt` y el nombre |

### 9. Probar sin la pantalla
- `npm run emulator -- --server <url> --ca ca.crt --cert pN.crt --key pN.key --wakes 1` se porta como el ESP32 y deja en una carpeta lo que mostraría el panel. Es la referencia de comportamiento.
- `npm run contract:mock`: un simulador con las respuestas de ejemplo del contrato.
- Todo el detalle: `contract/openapi/v1.json`, `contract/schema/v1/` y `docs/fichas/F-001-contrato-protocolo.md`.
