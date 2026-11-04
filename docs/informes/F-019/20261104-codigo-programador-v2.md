## Informe del programador — F-019, vuelta 2

**Resultado:** las cuatro mejoras están hechas. Todas las comprobaciones pasan.

**Cambios**
1. **`tintero.cpp` `sendRequest`:** ahora usa `appendf`, que comprueba la truncación en cada escritura. Si algo no cabe, `n` queda igual a la capacidad y devuelve `false`, así que `sizeof head - n` no da la vuelta. Si falla, `sendRequest` devuelve `false`.
2. **`health.cpp` `begin()`:** `safeText` fuerza `\0` al final de `step`, `outcome` y `bootReason`. Si alguno tiene un carácter fuera de `[a-z0-9_-]`, descarta la falla guardada (`hasFailure = false`); si el corrupto es `bootReason`, descarta el aviso de arranque (`hasBoot = false`).
3. **R6 sin reloj:** `Saved` tiene un campo nuevo, `lastNoClock`, que se guarda cuando el reinicio ocurre sin reloj válido. En el arranque siguiente, `restartAllowed` solo permite otro reinicio si ya hay reloj o si `millis()` llegó a 3 600 s. La lógica quedó en una función pura de `recovery.cpp`.
4. **`main.cpp` `afterRetry`:** un indicador `stale409` sustituye la comparación `retry == STALE_MS`. `fetchView` lo pone solo cuando el servidor responde 409, y `fetchView` y `fetchIndex` lo limpian al empezar. Un `Retry-After: 5` ya cuenta como falla. Las esperas no cambian.

**Archivos:** `firmware/src/{tintero.cpp, health.cpp, main.cpp, recovery.h, recovery.cpp}` y `firmware/test/native/unit_test.cpp`. Todos estaban dentro del alcance de la ficha.

**Pruebas nuevas** (`testSelfHealingHelpers`, en `unit_test.cpp`):
- `safeText`: sin `\0` final, comillas, mayúsculas y capacidad 0.
- `appendf`: desbordes y que `n` no pase de la capacidad.
- `restartAllowed`: memoria nueva, nunca reiniciado, reinicio previo sin reloj (con y sin reloj ahora, con 1 h de `millis()`), reloj válido en el límite de 3 600 s y reloj perdido.

**Comprobaciones**
- `npm run typecheck`, `npm run lint`, `npm test` y `npm run format:check`: bien. `lint` da 85 avisos y 0 errores; vienen de `tests/acceptance` y son los mismos de antes.
- `npm test`: 564 pruebas pasan y 2 se omiten.
- `tools/probar-firmware`: `unit_test.cpp` y `parse_test.cpp` pasan. Hay que correrlos por separado porque cada uno tiene su propio `main`.
- `tools/compilar-firmware`: SUCCESS. RAM 32,8 % y flash 59,7 %.
- `tools/check-scope programador --base main`: bien.

No dejé archivos temporales.

--- programador · costo USD 0.353 · turnos 47 · tokens entrada 42 (+caché 581093) salida 14003 · success
