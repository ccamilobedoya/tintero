## Informe del verificador · F-019 · fase verificación · vuelta 1

**Veredicto:** fase verificación → **CUMPLE**, con CA22 pendiente del dueño. Las 2 fallas de F-019 que vi eran errores de mis propias pruebas, y las corregí.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA10 | PASA | `native.test.ts`: las pruebas C++ compilan a la primera con `-Wall -Wextra -Werror` y ASan/UBSan, y el binario sale con 0. Ninguna prueba nativa tuvo que corregirse. |
| CA11 | PASA | Nativa: 5 pares `raw1`/`pb1` decodificados de a 1 byte, de a 7 y de una vez, más `0x80`, sobrepaso y falta del último byte. `fixtures.test.ts` valida los pares. |
| CA12 | PASA | `packbits.test.ts`: ida y vuelta con 200 entradas al azar, sin `0x80`, `hoy` ≤ 16 000 bytes, y lanza ante flujo inválido. |
| CA13 | PASA | `server.test.ts`: `pb1` con CRC del `raw1` decodificado, `raw1` idéntico al de antes, ruido en `raw1`, `bmp,raw1` → 200 y `bmp` → 400. |
| CA14 | PASA | `emulator.test.ts`: el `screen.png` es idéntico con `--formats pb1,raw1` y con `raw1`. |
| CA15, CA16 | PASA | Nativas: `backoffMs` y `formatFailure`. |
| CA17, CA18 | PASA | Nativas: zonas e índice tolerantes, y `pb1` con `bytes` 11 000 y 48 001. |
| CA19 | PASA | `server.test.ts`: el índice recortado mide ≤ 2 048 bytes y registra `index-trimmed`; con las vistas de siempre no cambia. |
| CA20 | PASA | `firmware.test.ts` corrió `tools/compilar-firmware` (≈65 s). Sale 0, sin avisos, flash y RAM dentro de los topes. No guardé las cifras exactas. |
| CA21 | PASA | `firmware.test.ts`. Corregí una prueba mía (ver abajo). |
| CA22 | PENDIENTE DEL DUEÑO | Es en el panel real. No se puede probar aquí. |

**Resultado de toda la aceptación** (962 pasan, 7 fallan en la corrida completa; ninguna de F-019):
- **F-005 CA27** (3 motores sin `busy`): falla bajo carga. Pasa sola (8/8). Ya se sabía.
- **F-005 CA24** (prewarm): falló en la misma corrida, en el mismo archivo y bajo carga. Pasa sola.
- **F-008 CA4 y F-015** (presupuesto de dibujo, p. ej. 518 ms contra tope de 420): fallan bajo carga y pasan solas.
- **F-013 CA20 y F-014 CA14** («siguen pasando»): relanzan F-005, F-006 y F-008 por dentro. Fallan por CA27 de F-005 (`503 busy`), incluso al correrlas solas. Con el estado actual de F-005 no puedo darlas por buenas: son reflejo de CA27, no un problema nuevo.
- **F-007 CA6**: falla porque falta `.revisar/semgrep.json`. Hay que correr `tools/revisar --base main` antes. Es del entorno, no del código.
- Ninguna falla involucra `pb1` ni `Tintero-Formats`. La ficha dice que no cambia ninguna prueba anterior, y eso se cumple: `bmp` sigue siendo 400.

**Pruebas:** `tests/acceptance/F-019/` (7 archivos de prueba y 5 C++ nativos); en la corrida de F-019 pasaron 64 de 66 antes de corregir.

**Pruebas corregidas por contradecir la ficha:**
1. **CA21** (`firmware.test.ts`): buscaba la cadena `"pb1,raw1"` entre comillas. El código la tiene dentro de un formato de `printf`, `Tintero-Formats: pb1,raw1\r\n`. Ahora la expresión regular acepta `\r\n` o la comilla de cierre.
2. **CA13** (`server.test.ts`): pedía 200 para `future,pb1` y para `pb1` solos. La ficha solo dice que se ignoran los nombres desconocidos si queda uno conocido. El servidor ya exigía `raw1` en la lista antes de F-019, así que `future,pb1` sin `raw1` da 400. Ahora uso `future,pb1,raw1`.

**Pregunta para el arquitecto:** ¿`Tintero-Formats: pb1` sin `raw1` debe ser 200? Hoy da 400, y la ficha no lo dice. El firmware declara `pb1,raw1`, así que no afecta al aparato.

**Herramientas:** `tsc --noEmit -p tests/acceptance` sin errores. `eslint tests/acceptance` da 0 errores y 89 avisos, casi todos de pruebas anteriores. En `server.test.ts` de F-019 hay 3 directivas `eslint-disable` sin uso, y en `packbits.test.ts` 1 aviso de inyección de objeto.
**check-scope verificador:** ✅

--- verificador · costo USD 0.305 · turnos 24 · tokens entrada 36 (+caché 634623) salida 6582 · success
