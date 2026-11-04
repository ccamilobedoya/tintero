## Informe del revisor · F-019 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (4)

Los ❌ de `npm audit` y `osv-scanner` son anteriores a la ficha: `package-lock.json` no cambió. No cuentan. No encontré bloqueantes en la lista de chequeo.

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Lo que comprobé**
- **Seguridad:**
  - No aparece `setInsecure` ni `HTTPClient` en `firmware/src`.
  - `begin()` sigue validando solo con `setCACert(TINTERO_CA_PEM)`.
  - El `Host` sale de `TINTERO_HOST`, fijo en compilación.
- **Entradas con tope:**
  - Cabeceras: 512 B por línea, 48 líneas, 4 096 B en total.
  - Cuerpo: `Content-Length` > `maxBody` da `TooLarge` sin leer. `bodyLeft` limita la lectura y `BufferSink` rechaza lo que sobra.
  - `Retry-After`: acotado a 3 600 y con saturación (`NUMBER_CAP`), así que no hay desbordes.
  - `PackBitsSink`: nunca escribe más de `rawBytes`. Los literales y las repeticiones se comprueban bien.
  - `unpackBits`: lanza ante `128`, ante un flujo que se pasa o que queda corto.
  - Índice `pb1`: `validate.ts` exige `bytes` ≤ `raw1Bytes`.
- **Plazos:**
  - `readResponse` comprueba `totalMs` e `idleMs` y llama a `pause()` cada vez que `read` devuelve 0.
  - La escritura del pedido está acotada por `setTimeout` de 10 s.
  - El reintento por conexión reutilizada es de una sola vez.
  - El *watchdog* de 60 s se alimenta en `loop()`, en `pause()` y en cada intento.
- **Avisos a `/api/v1/log`:**
  - El texto sale de `formatFailure` con paso, resultado, números y motivo del arranque.
  - Los nombres vienen de listas fijas, sin comillas ni datos personales, así que no rompen el JSON.
  - El servidor ya valida el largo (200) y limpia con `clean()`.
  - `noteTrim` registra solo evento y cantidad.
- **Servidor:**
  - `pb1` se codifica una vez por dibujo.
  - Con `raw1` queda igual que antes.
  - `trimIndex` y `trimZones` están acotados.
- **Herramientas y configuración:** no hay cambios en `tools/`, `eslint.config.js`, `.npmrc`, `.gitleaks.toml` ni `package.json`. Solo se fijó ArduinoJson en `platformio.ini`.

**Mejoras** (se anotan en la ficha)
1. `firmware/src/tintero.cpp:92-98` (`sendRequest`) — Tras el primer chequeo, `n += snprintf(head+n, sizeof head - n, …)` puede dejar `n` > 640 si se trunca. Entonces `sizeof head - n` se desborda hacia un valor enorme. Con host y rutas actuales no ocurre. Se corrige comprobando `n` tras cada `snprintf`, o armando la cabecera con una función que acote.
2. `firmware/src/health.cpp:56-64,79-100` — `RTC_NOINIT_ATTR` se valida solo con `magic`. Si la memoria quedara corrupta con el número mágico intacto (p. ej. un *brownout*), `saved.step/outcome/bootReason` podrían no terminar en `\0` o traer comillas, y romper el JSON del aviso. Se corrige forzando `\0` al final de cada campo y filtrando los caracteres a `[a-z0-9_-]` en `begin()`.
3. `firmware/src/health.cpp:136` — Sin reloj válido se guarda `lastRestartAt = 0`, y eso permite otro reinicio inmediato. Eso afloja R6, aunque lo frena la espera creciente. Se corrige guardando una marca distinta de 0 (o un contador de arranque) cuando no hay reloj.
4. `firmware/src/main.cpp:67` — `afterRetry` toma `retry == STALE_MS` (5 000 ms) como un 409. Un `Retry-After: 5` del servidor (429/503) tampoco contaría como falla. Es un caso raro. Se corrige separando el 409 con un valor distinto, o devolviendo un indicador aparte.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- `snprintf` encadenado con `n += …` y `sizeof buf - n` sin comprobar la truncación (mejora 1) → regla de `semgrep` para C++ en `firmware/src`, o una línea en `CLAUDE.md`: «acumular `snprintf` solo con una función que acote `n`». El arquitecto decide si vale la pena.

--- revisor · costo USD 0.339 · turnos 11 · tokens entrada 10 (+caché 141647) salida 8329 · success
