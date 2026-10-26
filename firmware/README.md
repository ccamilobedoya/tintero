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
| `Tintero-View` | opcional: el id de la vista que muestra el aparato ahora (ver *Foco y acciones*) |

### 5. Una despertada
1. `GET /api/v1/index` → `current`, `views[]` (con `hash`, `bytes`, `crc32`), `panel`, `next_wake_s` (cambia con `Tintero-Power`: 600 con `usb`, 1800 con `battery`, por defecto).
2. Si el `panel` de la respuesta no es el que se declaró, no mostrar nada nuevo y volver en `next_wake_s`.
3. Por cada vista cuya `hash` cambió (empezando por `current`): `GET /api/v1/views/{id}/image?h={hash}` y `GET /api/v1/views/{id}/zones?h={hash}`. Comprobar que la imagen tiene **exactamente** `bytes` (48 000 en el panel actual) y su **CRC-32** (el de zlib) antes de guardarla o mostrarla.
4. Mostrar `current`; el foco (anillo) lo dibuja el ESP32 con refresco parcial sobre las zonas (ADR-0006, ver *Foco y acciones*). Si `full_refresh` es `true`, esa imagen se muestra con el refresco completo lento.
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

### 9. Foco y acciones (F-008, ADR-0048 a ADR-0050)
Lo que hace el aparato; el servidor ya entrega las zonas alineadas y con la banda en blanco.

- **Zonas alineadas al byte:** `x` y `w` de cada zona son múltiplos de 8, así que la ventana parcial de una zona es exactamente la zona (sin partir bytes). `validateZones` da `unaligned` si no.
- **El anillo punteado.** La respuesta de zonas trae `focus: { ring, pad, dash }` (a 124 ppp: 3, 6 y 8). Se **invierten** los píxeles de la zona a menos de `ring` de su borde; con `dash > 0`, un píxel de la franja de **arriba o de abajo** se invierte solo si `floor((x − zona.x) / dash)` es par, y uno de la franja **izquierda o derecha** (fuera de las de arriba y abajo) solo si `floor((y − zona.y) / dash)` es par. Con `dash = 0` el anillo es sólido. Por dentro de cada zona hay una banda de `pad` px **en blanco** (≥ `ring`): el anillo nunca toca contenido, y quitarlo es invertir otra vez.
- **Estados:**
  - *sin foco*: al despertar y al cambiar de vista; ninguna zona lleva borde.
  - *foco*: anillo punteado en la zona. **Mover corto** = siguiente zona (la primera vez, la zona 1).
  - *enviando*: al soltar **Aceptar**, anillo **sólido** por refresco parcial y `POST /api/v1/actions`.
  - *aplicado*: la respuesta trae `index_changed: true` → `GET /api/v1/index` en la misma conexión (el servidor espera hasta 2 s el dibujo; con `503 busy` esperar `Retry-After` y reintentar **una** vez), bajar la imagen nueva y mostrarla con **un solo completo rápido**, con el anillo ya puesto en la zona con el **mismo id** (la tarea marcada pasa a *Hecho hoy* y el foco la sigue; deshacer es otro Aceptar) o, si ya no existe, en la zona del **mismo índice** (la última si hay menos).
  - *descartado*: `stale` → sacar la acción de la cola y pedir el índice; `duplicate` → sacar de la cola.
  - *sin red*: vuelve el anillo punteado y la acción queda en la cola (hasta 8), sin marca optimista (ADR-0025).
- **Limpieza.** Un completo rápido al quedarse quieto (unos 30 s, quitando el foco) y tras un tope de parciales que se mide en el panel (para empezar, 10).
- **`full_refresh`.** `true` = la **próxima** imagen que se muestre va con el refresco completo **lento**. El servidor lo pone en el primer `index` del día de cada pantalla.
- **`Tintero-View`.** Mandar en cada petición el id de la vista que se muestra (también tras un cambio de vista con Mover largo, que el servidor no ve). El servidor dibuja esa vista primero y la devuelve como `current`; si no la conoce, la ignora. Un valor que no cumple `^[a-z0-9_-]{1,16}$` da `400 invalid_request`.
- **Letra y trazos.** Con el refresco rápido los trazos de 1 px se ven tenues: el tema usa trazos de al menos 2 px. La vista `calibracion` (`config/calibracion.views.example.json`) sirve para decidir en el panel los grosores y la letra de los detalles (ADR-0049).

### 10. Probar sin la pantalla
- `npm run emulator -- --server <url> --ca ca.crt --cert pN.crt --key pN.key --wakes 1` se porta como el ESP32 y deja en una carpeta lo que mostraría el panel. Es la referencia de comportamiento.
- `npm run contract:mock`: un simulador con las respuestas de ejemplo del contrato.
- Todo el detalle: `contract/openapi/v1.json`, `contract/schema/v1/` y `docs/fichas/F-001-contrato-protocolo.md`.
