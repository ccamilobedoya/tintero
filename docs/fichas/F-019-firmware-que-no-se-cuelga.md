# F-019 · El firmware no se cuelga, se cura solo y baja la imagen comprimida

**Estado:** aprobada
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna en npm ni en el firmware. Para las pruebas nativas del firmware, una imagen de contenedor `gcc` fijada por *digest* (la pone el arquitecto en A1, fuera de `package.json`).

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos.
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto

**El incidente.** La pantalla real deja de actualizarse: baja el índice y la imagen de `hoy` y no vuelve a pedir nada. Reiniciar el ESP32 no lo arregla. El firmware lo escribe el dueño (ADR-0013); esta ficha existe porque él la pidió.

**Lo que dicen los datos** (registro del servidor, del 2026-10-25 al 2026-11-01):
- La respuesta de zonas (lo que usa la navegación con los botones) pesa **800 a 930 bytes** con las tareas de hoy. El peor caso del contrato (48 zonas) son unos 3,3 KB, por debajo del tope de 4 096. **No es lo pesado.** Lo pesado es la imagen: **48 000 bytes**, el 98 % de lo que baja en cada cambio.
- En cada falla el servidor registra el índice y la imagen (200, 48 000 bytes) y **el pedido de zonas nunca llega**. Es decir, el ESP32 se queda trabado **mientras recibe la imagen**, antes de pedir las zonas.
- Después de cada falla el aparato queda callado entre 1 y 14 horas y luego vuelve a pedir el índice y la imagen, y se traba otra vez. Encaja con una conexión que se queda abierta pero sin datos hasta que algo de la red la cierra.
- En una despertada normal, la imagen tarda unos 3 s en llegar (de la imagen a las zonas en el registro).

**La causa en el código.** El firmware lee el cuerpo con `HTTPClient::writeToStream` (Arduino-ESP32 3.3.12). Su bucle `writeToStreamDataBlock` repite «leer lo que haya» **mientras la conexión siga abierta** y **no tiene plazo**: si los datos dejan de llegar y la conexión TLS no se cierra, gira para siempre (los 20 s de `setTimeout` solo cortan cada lectura, y el bucle vuelve a empezar). Además, el firmware no tiene *watchdog*: un cuelgue es permanente hasta que la red corta la conexión.

**Por qué dejan de llegar los datos: no está confirmado.** Puede ser el camino de red (Funnel, MTU) o algo del ESP32. Esta ficha no depende de saberlo: corta cualquier espera sin progreso, se recupera sola y **le avisa al servidor** qué pasó (R7), para que la próxima vez se sepa sin el monitor serie.

**La optimización.** Las zonas ya son pequeñas: comprimirlas o juntarlas con la imagen ahorra menos de 1 KB por cambio. En cambio la imagen, medida sobre 20 imágenes reales de 800×480 del repo (`docs/guide/img/`, `docs/disenos/`), se comprime así:

| Formato | `hoy` | `agenda` | `tablero` | Costo en el ESP32 |
|---|---|---|---|---|
| `raw1` (hoy) | 48 000 | 48 000 | 48 000 | — |
| PackBits (`pb1`) | 11 300 – 12 400 | 9 100 – 9 500 | 9 000 – 11 000 | ~40 líneas, sin biblioteca, se prueba en el PC |
| zlib | 5 000 – 6 000 | 3 800 – 4 100 | 3 200 – 4 400 | `tinfl` de la ROM, API delicada, no se prueba en el PC sin traer miniz |

Con `pb1` la imagen baja **4 veces menos bytes** (unos 12 KB en vez de 48 KB): menos tiempo con la conexión expuesta y menos batería después. zlib ganaría el doble, pero a cambio de una pieza que no se puede probar fuera del aparato (D2).

ADR que aplican: 0001 (el servidor dibuja), 0013 y 0060 (el firmware es del dueño y vive en el repo), 0018 (protocolo v1, campos desconocidos se ignoran), 0020 (`raw1` con CRC-32), 0025 (sin marca optimista), 0045 (ninguna promesa sin atrapar).

## Decisiones (el dueño elige)

| # | Tema | Propuesta | Estado |
|---|---|---|---|
| **D1** | Leer las respuestas | El firmware deja `HTTPClient` y lee la respuesta él mismo sobre `NetworkClientSecure`, con un lector **sin Arduino** (se prueba en el PC) que tiene plazo sin progreso, plazo total y topes de cabeceras. Alternativa: seguir con `HTTPClient` solo para las cabeceras y leer el cuerpo a mano (menos código, pero sus cabeceras crecen sin tope y no se pueden probar en el PC) | ✅ (dueño, 2026-11-04) |
| **D2** | Formato comprimido | **`pb1`** (PackBits sobre `raw1`), negociado con `Tintero-Formats` (ADR nueva). zlib queda anotada para después si hace falta | ✅ (dueño, 2026-11-04) |
| **D3** | Conexión | Se sigue reutilizando la conexión dentro de una despertada **solo** si la respuesta anterior terminó bien (`reusable`); ante cualquier otra cosa, se cierra y la siguiente abre una nueva. Si un pedido sobre una conexión reutilizada falla antes del primer byte de respuesta, se reintenta **una vez** con una conexión nueva | ✅ (dueño, 2026-11-04) |
| **D4** | Último recurso | *Task watchdog* de **60 s** sobre `loop()`: si algo se traba de todas formas, el ESP32 se reinicia solo | ✅ (dueño, 2026-11-04) |
| **D5** | Reintentos | Espera creciente tras fallas seguidas: 30 s, 60 s, 120 s… hasta **15 min**; vuelve a 0 con la primera sincronización buena | ✅ (dueño, 2026-11-04) |
| **D6** | Zonas | **Sin cambio de formato** (ver Contexto). Solo se vuelven tolerantes (R10) | ✅ (dueño, 2026-11-04) |

## Alcance

- **A · Que no se cuelgue:** lector de respuestas con plazos (R1), cliente sin `HTTPClient` (R2, R3), *watchdog* (R4).
- **B · Que se cure solo:** espera creciente (R5), reinicio controlado (R6), avisos al servidor (R7).
- **C · Menos bytes:** formato `pb1` en el contrato, el servidor, el emulador y el firmware (R8, R9).
- **D · Que no haga falta grabar el firmware por casos normales:** el firmware tolera lo que no conoce (R10, R11) y el servidor nunca manda algo que el firmware tenga que rechazar (R12, R13).

**Fuera de alcance:** actualizar el firmware por la red (OTA); configurar el Wi-Fi sin grabar (portal de configuración); varias redes Wi-Fi; batería y sueño profundo (`Tintero-Power` sigue fijo en `usb`); cambiar de CA o de nombre del servidor sin grabar; zlib; codificación `chunked`; mostrar en el panel un aviso «sin conexión» (lo dibuja el servidor, ADR-0001); cambiar el formato de las zonas. Todo esto queda en la tabla de casos borde con su ficha futura.

## Requisitos

### A · Que no se cuelgue

- **R1. Lector de respuestas** `firmware/src/http_reader.{h,cpp}`, **sin `Arduino.h`** (solo `<cstdint>`, `<cstddef>`, `<cstring>`), con el contrato de abajo. Reglas:
  - Línea de estado `HTTP/1.1 NNN …` o `HTTP/1.0 NNN …`; cualquier otra cosa → `BadHeader`.
  - Cada línea de cabecera (sin `\r\n`) ≤ **512** bytes; ≤ **48** cabeceras; todo el bloque de cabeceras ≤ **4 096** bytes. Si se pasa → `BadHeader`. Los nombres se comparan sin distinguir mayúsculas.
  - `Content-Length` es obligatorio cuando el código es 200 (sin él → `BadHeader`). Con 204 o 304 el cuerpo es 0. Con otros códigos, si hay `Content-Length` se lee (hasta `maxBody`) y si no, el cuerpo se toma como vacío y la conexión no se reutiliza.
  - `Transfer-Encoding` presente con cualquier valor → `BadHeader` (fallar cerrado: el servidor nunca lo usa).
  - `Content-Length` > `maxBody` → `TooLarge` **sin leer el cuerpo** (el `Sink` no recibe nada).
  - **Plazo sin progreso:** si pasan `idleMs` sin recibir ningún byte (en cabeceras o cuerpo) → `Stalled`. **Plazo total:** si desde la llamada pasan `totalMs` → `Timeout`. Los dos cuentan con `Clock::nowMs()`; el de progreso se reinicia con cada byte recibido.
  - `Source::read` < 0 antes de completar → `Closed`.
  - El `Sink` devuelve `false` → `BadBody` (el lector deja de leer).
  - `Retry-After`: solo dígitos, acotado a 0…3 600; si no son solo dígitos, 0.
  - `reusable` es `true` solo con `Ok`, HTTP/1.1 y sin `Connection: close`.
  - Cuando `Source::read` devuelve 0, el lector llama a `Clock::pause()` antes de volver a leer (nunca gira sin pausa).
- **R2. Cliente** (`firmware/src/tintero.{h,cpp}`): usa `NetworkClientSecure` directamente; escribe el pedido a mano (`GET <ruta> HTTP/1.1`, `Host`, las cabeceras del protocolo de siempre, `Content-Length` en el POST) y lee con `http::readResponse`. Ningún archivo de `firmware/src` incluye `HTTPClient.h`. La escritura del pedido tiene plazo (`setTimeout` del cliente ≤ 10 s). `tintero::Response` suma el campo `http::Outcome outcome`. `Tintero-Firmware` pasa a `esp32-0.2`.
- **R3. Plazos por pedido** (constantes en `tintero.cpp`): índice, zonas, acciones y avisos: `idleMs = 10 000`, `totalMs = 15 000`. Imagen: `idleMs = 10 000`, `totalMs = 30 000`. Reutilización y reintento según D3.
- **R4. *Watchdog*:** en `setup()`, `esp_task_wdt_reconfigure` con 60 s y `trigger_panic = true`, y `esp_task_wdt_add` de la tarea de `loop()`. Se alimenta al principio de cada `loop()` y dentro de `Clock::pause()` del cliente. Ningún paso sin alimentarlo dura más de 30 s (Wi-Fi 20 s, SNTP 15 s, refresco completo ~3 s, `delay` de `Retry-After` ≤ 10 s).

### B · Que se cure solo

- **R5. Espera creciente:** función pura `uint32_t backoffMs(uint32_t failures)` en `firmware/src/recovery.{h,cpp}` (sin `Arduino.h`): 0 → 0; n ≥ 1 → `min(30 000 × 2^(n−1), 900 000)`. `failures` cuenta las sincronizaciones seguidas que no terminaron en un índice válido **o** en una vista nueva bajada entera, desde el último arranque o la última buena. Tras una falla, la espera es `max(backoffMs(failures), lo que pida el servidor)` (409 → 5 s sigue igual, sin contar como falla).
- **R6. Reinicio controlado:** `ESP.restart()` si (a) `failures` ≥ **8**, o (b) antes de abrir una conexión TLS el bloque libre más grande del *heap* (`heap_caps_get_largest_free_block(MALLOC_CAP_8BIT)`) es < **45 000** bytes. Nunca dos reinicios controlados en menos de **1 h**: la hora del último se guarda en memoria `RTC_NOINIT_ATTR` (sobrevive al reinicio) con un número mágico que dice si es válida.
- **R7. Avisos al servidor:** el firmware guarda en `RTC_NOINIT_ATTR` la **última falla** (paso `index|image|zones|actions|log`, `Outcome`, bytes recibidos y esperados, ms, RSSI, *heap* libre) y, al arrancar, el **motivo del arranque** (`esp_reset_reason()`). Con la primera sincronización buena después, manda `POST /api/v1/log` con hasta 3 entradas (`warn` la falla, `info` el arranque) y las borra solo si la respuesta es 204. El texto lo arma la función pura `size_t formatFailure(const Failure &f, char *out, size_t cap)` de `recovery.{h,cpp}`: formato exacto `"<paso> <outcome> <recibidos>/<esperados> B <ms> ms rssi <rssi> heap <heap>"`, en minúsculas, ≤ 200 caracteres, siempre terminado en `\0`, y devuelve el largo (sin el `\0`); con `cap` = 0 devuelve 0 y no escribe.

### C · Menos bytes: el formato `pb1`

- **R8. Contrato.** Formato nuevo `pb1`: el cuerpo de la imagen es `raw1` codificado con PackBits, como un solo flujo sobre los `ceil(w/8)×h` bytes (las corridas cruzan filas). Byte de control `n`: `0…127` → copiar los `n+1` bytes que siguen; `129…255` → repetir `257−n` veces el byte que sigue; **`128` es inválido**. En el índice, una vista `pb1` lleva `format: "pb1"`, `bytes` = largo del cuerpo `pb1` y **`crc32` = CRC-32 del `raw1` ya decodificado** (se comprueba lo que va al panel). `hash` y `ETag` no cambian. Esquema: `format` y `Tintero-Formats` aceptan `pb1`. **`Tintero-Formats` ignora los nombres que no conoce** si queda al menos uno conocido (`bmp` solo sigue siendo inválido; `bmp,raw1` pasa a ser válido). Función compartida en `contract/src/packbits.ts`: `packBits(raw: Uint8Array): Uint8Array` y `unpackBits(packed: Uint8Array, rawBytes: number): Uint8Array` (lanza `Error` si el flujo es inválido, si se pasa de `rawBytes` o si termina antes).
- **R9. Servidor, emulador y firmware.**
  - Servidor: si el aparato declara `pb1` **y** `packBits(raw).length < raw.length`, la vista va en `pb1` (índice e imagen); si no, en `raw1` exactamente como hoy. La codificación se hace una vez por dibujo (se guarda con la imagen), no en cada pedido.
  - Emulador: opción `--formats <lista>` (por defecto `raw1`, como hoy); con `pb1`, decodifica con `unpackBits` y comprueba el CRC-32 sobre lo decodificado.
  - Firmware: declara `Tintero-Formats: pb1,raw1`. Decodificador en `firmware/src/packbits.{h,cpp}` (sin `Arduino.h`): `class PackBitsSink : public http::Sink` con `PackBitsSink(uint8_t *out, size_t rawBytes)`, `bool write(const uint8_t *data, size_t n)` (acepta el flujo en pedazos de cualquier tamaño, incluso de a 1 byte; devuelve `false` ante `128` o si se pasa de `rawBytes`) y `bool complete() const` (`true` solo si escribió exactamente `rawBytes`). `parseIndex` acepta `pb1` con `bytes` ≤ `raw1Bytes` y `raw1` con `bytes` = `raw1Bytes`.

### D · Que no haga falta grabar el firmware por casos normales

- **R10. Zonas tolerantes:** en `parseZones`, una zona con un `act` desconocido **se salta** (las demás quedan); cualquier otro error sigue invalidando la respuesta entera.
- **R11. Índice tolerante:** en `parseIndex`, una vista con un `format` desconocido **se salta** (y las que la tengan como `parent` también); si la que se salta es `current`, el índice es inválido como hoy.
- **R12. El servidor respeta los topes del contrato:** antes de mandar un índice lo serializa y, si pasa de 2 048 bytes, quita vistas desde el final (nunca `current` ni el `parent` de `current`) hasta que quepa, y registra una vez por dibujo el aviso `index-trimmed` con cuántas quitó. Igual con las zonas: si pasan de 4 096 bytes, quita zonas desde el final y registra `zones-trimmed`. Las quitadas no se pueden enfocar.
- **R13. `Retry-After` y `next_wake_s` acotados en el firmware:** `Retry-After` ya viene acotado de R1; la espera por 429/503 queda en 1…3 600 s.

## Contrato

```cpp
// firmware/src/http_reader.h — sin Arduino.h
namespace http {
struct Source { virtual int read(uint8_t *buf, size_t n) = 0; };  // >0 bytes, 0 nada todavía, <0 cerrada o error
struct Clock  { virtual uint32_t nowMs() = 0; virtual void pause() = 0; };  // pause: ~2 ms y alimenta el watchdog
struct Sink   { virtual bool write(const uint8_t *data, size_t n) = 0; };   // false = no se puede seguir
struct BufferSink : Sink { BufferSink(uint8_t *buf, size_t cap); bool write(const uint8_t *, size_t) override; size_t length() const; };
struct Limits { uint32_t idleMs; uint32_t totalMs; size_t maxBody; };
enum class Outcome { Ok, Stalled, Timeout, Closed, TooLarge, BadHeader, BadBody };
const char *outcomeName(Outcome o);  // "ok", "stalled", "timeout", "closed", "too-large", "bad-header", "bad-body"
struct Result { Outcome outcome; int status; size_t bodyBytes; uint32_t retryAfterS; bool reusable; };
Result readResponse(Source &src, Clock &clock, const Limits &limits, Sink &sink);
}  // namespace http

// firmware/src/recovery.h — sin Arduino.h
uint32_t backoffMs(uint32_t failures);
struct Failure { char step[8]; const char *outcome; uint32_t got, expected, ms; int rssi; uint32_t heap; };
size_t formatFailure(const Failure &f, char *out, size_t cap);
```

`bodyBytes` cuenta los bytes del cuerpo entregados al `Sink`. `status` es 0 si no llegó una línea de estado válida.

## Criterios de aceptación

Las pruebas nativas (CA1 a CA14) compilan `firmware/src/{http_reader,packbits,recovery}.cpp` con las pruebas en C++ de `tests/acceptance/F-019/native/` usando `tools/probar-firmware` (A1), con `-std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined`. En ellas, `FakeClock::pause()` suma **2 ms** a `nowMs()`, y una `FakeSource` entrega un guion de pedazos («n bytes», «0 durante t ms», «−1»).

**Lector (R1)**
- **CA1. Imagen que se traba:** cabeceras `HTTP/1.1 200 OK\r\nContent-Length: 48000\r\n\r\n`, 20 000 bytes de cuerpo y luego 0 para siempre; `Limits{10000, 30000, 48000}` → `Stalled`, `status` 200, `bodyBytes` 20 000, `reusable` false, y `readResponse` vuelve con `nowMs()` entre 10 000 y 10 010 ms después del último byte.
- **CA2. Goteo:** el mismo encabezado y 1 byte cada 100 ms → `Timeout` con `nowMs()` entre 30 000 y 30 110 desde la llamada.
- **CA3. Cabeceras que no terminan:** solo `HTTP/1.1 200 OK\r\n` y luego 0 → `Stalled`, `bodyBytes` 0.
- **CA4. Se cierra antes:** 1 000 bytes de cuerpo y luego −1 → `Closed`, `bodyBytes` 1 000.
- **CA5. Demasiado grande:** `Content-Length: 70000` con `maxBody` 48 000 → `TooLarge`, el `Sink` recibió 0 bytes.
- **CA6. Cabeceras malas → `BadHeader`:** una línea de 513 bytes; 49 cabeceras; 200 sin `Content-Length`; `Transfer-Encoding: chunked`; línea de estado `HTTP/2 200`; `ICY 200 OK`. Una línea de 512 bytes y 48 cabeceras → `Ok`.
- **CA7. `Retry-After`:** `7` → 7; `99999999` → 3 600; `abc` → 0; `-5` → 0; sin la cabecera → 0.
- **CA8. Reutilizable:** respuesta normal HTTP/1.1 → `true`; con `Connection: close` (y `connection: Close`) → `false`; `HTTP/1.0` → `false`.
- **CA9. `Sink` que se llena:** `BufferSink` de 100 bytes con un cuerpo de 865 → `BadBody`.
- **CA10. Normal en pedazos:** 865 bytes de zonas con cabeceras y cuerpo partidos en pedazos de 1, 7 y 1 436 bytes alternados → `Ok`, `bodyBytes` 865, el contenido idéntico. 204 sin cuerpo → `Ok`, `bodyBytes` 0. 404 con `Content-Length: 0` → `Ok`, `status` 404.

**`pb1` (R8, R9)**
- **CA11. Decodificador del firmware:** los pares `tests/acceptance/F-019/fixtures/<nombre>.raw1` / `<nombre>.pb1` (los genera el verificador con un codificador propio de la prueba que sigue R8 al pie de la letra, desde imágenes `raw1` dibujadas por el motor con los datos de prueba, como en F-005: `hoy`, `agenda`, `tablero`, más una toda blanca y una de ruido con semilla fija) se decodifican con `PackBitsSink` alimentado de a 1 byte, de a 7 y de una vez → idéntico al `raw1`, `complete()` `true`. Un control `0x80` → `write` `false`. Un flujo que se pasa por 1 byte → `false`. Uno al que le falta el último byte → `complete()` `false`.
- **CA12. Codificador compartido:** `unpackBits(packBits(x), x.length)` = `x` para 200 entradas al azar (semilla fija, largos 0…48 000) y las imágenes de CA11; `packBits` nunca emite `0x80`; con la imagen de `hoy` de los datos de prueba, `packBits(raw).length` ≤ 16 000. `unpackBits` lanza con `0x80`, con un flujo que se pasa y con uno corto.
- **CA13. Servidor:** con `Tintero-Formats: pb1,raw1`, cada vista del índice tiene `format: "pb1"`, `bytes` = largo del cuerpo de su imagen, y `crc32` = CRC-32 de `unpackBits(cuerpo, 48000)`; con `Tintero-Formats: raw1`, el índice y las imágenes son **byte a byte** los de antes de la ficha (mismos datos de prueba y misma hora). Con una imagen de ruido que no se achica, esa vista va en `raw1` aunque el aparato acepte `pb1`. Con `Tintero-Formats: bmp,raw1` → 200 (antes 400); con `bmp` → 400 como siempre.
- **CA14. Emulador:** con `--formats pb1,raw1` deja un `screen.png` idéntico píxel a píxel al de `--formats raw1`, con el mismo servidor y la misma hora.

**Que se cure solo (R5, R7)**
- **CA15. `backoffMs`:** 0 → 0; 1 → 30 000; 2 → 60 000; 5 → 480 000; 6 → 900 000; 100 → 900 000; `UINT32_MAX` → 900 000.
- **CA16. `formatFailure`:** `{"image", "stalled", 20000, 11873, 10012, -67, 81234}` → `"image stalled 20000/11873 B 10012 ms rssi -67 heap 81234"` y devuelve 56; con `cap` 10 → 9 caracteres y `\0`; con `cap` 0 → 0.

**Tolerancia (R10 a R12)** (pruebas nativas con `index.cpp`, `zones.cpp` y ArduinoJson, más el `Arduino.h` mínimo de `tools/probar-firmware`)
- **CA17. Zonas:** 3 zonas, la del medio con `act: "link"` → válida con 2 zonas (la primera y la tercera). Un campo desconocido `"color": 3` en una zona → se ignora.
- **CA18. Índice:** 3 vistas, una (no `current`) con `format: "png9"` → válido con 2 vistas; si esa es `current` → inválido. Una vista `pb1` con `bytes` 11 000 → válida; `pb1` con `bytes` 48 001 → inválido.
- **CA19. Topes del servidor:** con 16 vistas de id de 16 caracteres, cada una con `parent` de 16 caracteres salvo la primera, el índice mide ≤ 2 048 bytes, `current` está, se registró `index-trimmed`, y lo que queda valida con el contrato. Con las vistas de prueba de siempre, el índice no cambia y no hay aviso.

**Firmware entero (R2 a R4, R6)**
- **CA20. Compila:** `tools/compilar-firmware` sale 0, sin avisos en `src/`; *flash* ≤ 1 900 000 bytes y RAM estática ≤ 110 856 bytes (línea de base 108 808 + 2 KB).
- **CA21. Revisión del código:** `grep -rn "HTTPClient" firmware/src` → nada; `esp_task_wdt_add` y `esp_task_wdt_reset` aparecen; `Tintero-Formats` vale `pb1,raw1`; `http_reader.cpp`, `packbits.cpp` y `recovery.cpp` no incluyen `Arduino.h`.
- **CA22. En el panel (el dueño, A3):** (a) un día normal: el registro del servidor muestra la imagen de `hoy` en `pb1` con menos de 16 000 bytes y las zonas detrás de cada imagen; (b) con el aparato funcionando, apagar el *router* 2 min mientras baja una imagen (Aceptar largo fuerza la descarga) y volver a prenderlo: el panel vuelve a actualizarse solo en menos de 20 min, sin tocar el ESP32, y llega un aviso `image …` al registro; (c) al desconectar y conectar el USB, llega un aviso `info` con el motivo del arranque (`poweron`).

## Presupuestos

- Una despertada con cambio: índice + imagen `pb1` (~12 KB) + zonas, en ≤ **3 s** por la red de siempre (hoy ~3,5 s solo la imagen de 48 KB).
- Ninguna espera del firmware sin progreso pasa de **10 s**; ningún pedido, de **30 s**; ningún paso sin alimentar el *watchdog*, de **30 s**.
- RAM: `PackBitsSink` decodifica directo en el búfer de la imagen (2 bytes de estado); el lector usa ≤ **600** bytes de pila y ningún `malloc`. La RAM estática del firmware no crece más de **2 KB**.
- Servidor: codificar `pb1` una imagen de 48 000 bytes ≤ **5 ms**; se hace una vez por dibujo.

## Seguridad

- [x] Toda entrada externa con **límite de tamaño antes de parsear**: cabeceras (512 B por línea, 48 líneas, 4 KB en total), cuerpo (`maxBody`), `pb1` (nunca escribe más de `rawBytes`), `Retry-After` (3 600). En el servidor, `Tintero-Formats` sigue con su tope de largo.
- [x] Servicios locales solo en **127.0.0.1** (sin cambios).
- [x] Sin dependencias nuevas en npm ni en el firmware.
- El firmware sigue validando al servidor **solo** con la CA de Tintero; no aparece `setInsecure`.
- Los avisos de R7 no llevan datos personales ni llaves: solo el paso, el resultado, números y el motivo del arranque.
- Zona sensible: `contract/` (formato nuevo) y el cliente TLS del firmware → la revisión con Sonnet (salida 3).

## Tareas del arquitecto

| # | Tarea |
|---|---|
| **A1** ✅ | `tools/probar-firmware <prueba.cpp>… [-- <args>]`: compila en un contenedor `gcc` 14 fijado por *digest* y **sin red** `firmware/src/{http_reader,packbits,recovery,index,zones}.cpp` con las pruebas (y las `*.h` de su carpeta), ArduinoJson 7.4.2 (comprobado con sha256, como cabecera de sistema) y `tools/probar-firmware.d/Arduino.h` (`Serial.printf/print/println` a la salida; `millis()` y `delay()` sobre la variable `nativeMillis`). Banderas: `-std=c++17 -O0 -g -Wall -Wextra -Werror -fsanitize=address,undefined`. El binario corre en la carpeta de la primera prueba, con su carpeta madre montada de solo lectura (así `../fixtures/…` se lee). Salida: la del binario; 3 si falta una fuente o no compila. `tools/compilar-firmware [carpeta]`: `pio run` en un contenedor fijado, con `secrets.h` de la plantilla y un `tintero_certs.h` de relleno; imprime RAM y *flash*. Línea de base antes de esta ficha: **RAM 108 808 B, flash 1 214 444 B** |
| **A2** | ADR nuevas: «`pb1`, PackBits negociado» y «el firmware se cura solo (plazos, *watchdog*, avisos)» |
| **A3** | Compilar aquí (CA20) y darle al dueño el paso a paso de CA22 |

## Archivos

**A crear:** `firmware/src/http_reader.{h,cpp}`, `firmware/src/packbits.{h,cpp}`, `firmware/src/recovery.{h,cpp}`, `contract/src/packbits.ts` (+ `packbits.test.ts`), `tools/probar-firmware` (A1).
**A tocar:** `firmware/platformio.ini` (ArduinoJson fijo en `7.4.2`, la misma versión de las pruebas nativas), `firmware/src/tintero.{h,cpp}`, `firmware/src/main.cpp`, `firmware/src/index.cpp`, `firmware/src/zones.cpp`, `firmware/README.md` y `README.es.md` (§3 plazos, §4 `Tintero-Formats`, §5 `pb1`), `contract/src/schemas.ts`, `contract/src/validate.ts` (formatos desconocidos, `pb1`), `contract/schema/v1/*` y `contract/openapi/v1.json` (regenerados), `contract/fixtures/v1/valid/` (solo se agregan: `index-pb1.json`), `server/src/app.ts` y el motor donde se guarda la imagen dibujada (R9, R12), `emulator/src/` (R9).
**Pruebas anteriores que cambian:** ninguna conocida (`bmp` solo sigue siendo inválido); el verificador corre toda la aceptación para confirmarlo.

## Casos borde: lo que puede pasar y qué hace el sistema

Criterio: un caso **normal** (la red falla, crecen las tareas, cambia la configuración del servidor) **nunca** debe obligar a grabar el firmware. Lo que de verdad cambia el aparato (red Wi-Fi, nombre del servidor, CA) queda para fichas futuras.

| # | Caso | Hoy | Con F-019 | Dónde |
|---|---|---|---|---|
| 1 | Los datos dejan de llegar a mitad de la imagen y la conexión sigue abierta | **Se cuelga** hasta que la red corte (horas) | Corta a los 10 s, reintenta con espera creciente, avisa al servidor | R1, R5, R7 |
| 2 | Los datos llegan muy lento | Se queda esperando lo que dure | Corta a los 30 s | R1 |
| 3 | El servidor o el Funnel no responden | Reintenta cada 30 s para siempre | 30 s, 60 s… hasta 15 min | R5 |
| 4 | Algo no previsto traba el ESP32 (librería, panel) | Trabado para siempre | El *watchdog* lo reinicia a los 60 s y queda el motivo en el aviso | R4, R7 |
| 5 | La memoria se fragmenta tras semanas con USB y el TLS ya no cabe | Falla cada 30 s para siempre | Reinicio controlado (máx. 1 por hora) | R6 |
| 6 | Conexión reutilizada que el otro lado ya cerró | Puede fallar el siguiente pedido | Reintento con conexión nueva, una vez | D3 |
| 7 | Muchas tareas: más de 48 zonas | El servidor se queda con 48; el resto se ve pero no se enfoca | Igual (tope del contrato) | — |
| 8 | Muchas vistas o ids largos: índice > 2 048 bytes | El firmware lo rechaza y **la pantalla se congela** | El servidor recorta vistas y avisa | R12 |
| 9 | Zonas > 4 096 bytes | El firmware las descarta: sin navegación | El servidor recorta y avisa (hoy imposible con ids de 11 caracteres) | R12 |
| 10 | El servidor agrega un tipo de acción nuevo (`act`) | **Se pierden todas las zonas** | Solo se salta esa zona | R10 |
| 11 | El servidor agrega una vista en un formato nuevo | **Se rechaza el índice entero** | Se salta esa vista | R11 |
| 12 | Un firmware nuevo declara un formato que el servidor no conoce | **400**: el aparato no anda con un servidor viejo | Se ignora el nombre desconocido | R8 |
| 13 | `Retry-After` enorme | `× 1000` se desborda y la espera queda al azar | Acotado a 1 h | R1, R13 |
| 14 | Cabecera sin fin o miles de cabeceras | `String` crece sin tope en `HTTPClient` | Topes de 512 B, 48 líneas, 4 KB | R1 |
| 15 | Respuesta `chunked` o sin `Content-Length` | Se lee hasta el tope | Se rechaza (fallar cerrado) | R1 |
| 16 | Wi-Fi cae y vuelve | Reconecta en la próxima sincronización | Igual, con espera creciente | — |
| 17 | `millis()` da la vuelta (49,7 días) | Bien: todas las restas son sin signo | Igual; los plazos nuevos también restan sin signo | R1 |
| 18 | Se reinicia el servidor y pierde las acciones vistas | Un reenvío se aplicaría dos veces | Sin cambio (mejora anotada del servidor) | — |
| 19 | La vista que se mostraba desaparece del índice | Mover largo elige mal la siguiente (cuenta con −1 sin signo) | Sin cambio; se anota como mejora | — |
| 20 | Cambia la clave del Wi-Fi o la red | **Hay que grabar** | Igual. Ficha futura: portal de configuración | fuera |
| 21 | Cambia el nombre del servidor o la CA | **Hay que grabar** | Igual. Ficha futura: CA de respaldo en el firmware | fuera |
| 22 | Hay que corregir el firmware | Hay que llevar el PC al aparato | Igual. Ficha futura: OTA firmada desde Tintero (las dos particiones ya existen) | fuera |
| 23 | Certificados vencen (servidor 2 años, aparato 5, CA 10) | El servidor se renueva con la misma CA sin grabar; la CA, no | Igual; el aviso de R7 dirá `bad-header`/TLS si pasa | — |
| 24 | El SNTP no responde | No hay TLS hasta que responda | Igual, con espera creciente | R5 |
| 25 | El panel distinto al declarado | No muestra nada nuevo | Igual | — |

## Resultado esperado

El panel sigue actualizándose aunque la red se trabe a mitad de una descarga: a lo sumo pierde una vuelta, se recupera solo y el registro del servidor dice qué pasó (`image stalled 20000/11873 B …`). Cada cambio de vista baja unos 12 KB en vez de 48 KB. El servidor nunca manda un índice o unas zonas que el firmware tenga que rechazar, y el firmware se salta lo que no conoce en vez de quedarse sin pantalla.

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
