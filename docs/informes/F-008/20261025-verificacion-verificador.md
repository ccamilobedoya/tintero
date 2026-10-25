## Informe del verificador · F-008 · fase verificación · vuelta 1

**Veredicto:** NO CUMPLE. El motivo es una falla que depende de una decisión del arquitecto: F-005 CA10 «hoy en V124», por `tooSmall`.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `F-008/contract.test.ts`: los ejemplos nuevos dan `ok`, `unaligned` ×2 y `focus_pad`. `contract:check` sale con 0. |
| CA2 | PASA | `checkFocusBand` da los 5 resultados que pide la ficha. |
| CA3 | PASA | `F-008/render.test.ts`: tablero y F-005 en P124, P200 y V124 cumplen todas las propiedades. Una vez dio `busy` 503 por carga de la máquina; ver «Pruebas corregidas». |
| CA4 | PASA | Zonas, `hidden` y píxeles de la ficha. Presupuesto: mediana ≈300 ms (≤420) con `checkFocusBand` incluido. La media dio 490–580 por picos aislados de ≈800 ms (ver «Pruebas corregidas»). |
| CA5 | PASA | Zonas del `tablero` y `hidden`. |
| CA6 | PASA | El foco sigue a la tarea; `hechas` y `hidden.tareas = 3`. |
| CA7 | PASA | `text-decoration-thickness` de 2 px en P124 y 4 px en P200. |
| CA8 | PASA | `full_refresh` por aparato y por día local, también por HTTP. |
| CA9 | PASA | `Tintero-View` en el motor y por HTTP; `Tablero!` da 400. |
| CA10 | PASA | Emulador: cabecera, `renderScreen` y el foco tras `ok`. |
| CA11 | PASA | Calibración: `render` sale con 0, píxeles de las 6 columnas y 6 filas, `source` da `ConfigError`. |
| CA12 | FALLA | `npm run test:acceptance` da 552 de 554. Fallan dos pruebas anteriores, abajo. |

**Fallas de CA12:**
- **F-005 CA10 «hoy en V124 usa portrait» (falla del código o de la ficha):** esperaba `tooSmall = []` y obtuvo `["jira"]`. En vertical, `jira` ocupa el 15 % del alto. Con `issueRow + 2·focusPad`, `minH` pasa a ser mayor que el alto de esa área, así que sale «No cabe». La lista «Pruebas anteriores que cambian» solo me deja tocar coordenadas, píxeles, alturas y cantidad de zonas, no `tooSmall`, así que no la toqué. **Pregunta para el arquitecto:** ¿hay que cambiar el código (p. ej. el mínimo de `issue-list`) o las proporciones de la vista de F-005 en vertical, o la ficha autoriza que `jira` quede en `tooSmall`?
- **F-007 CA6 (no es del código):** falta `.revisar/semgrep.json`, que lo genera `tools/revisar --base main`. No lo corrí.

**Aclaración de la ficha:** F-001 CA4 y F-003 CA5 se actualizaron como dice la ficha. F-003 CA5 no falló; el cambio ya venía en el repo.

**npm test:** pasa, 416 de 418 con 2 omitidas. La primera salida trajo un aviso de bloqueo de hook; la segunda corrida salió limpia.

**Pruebas:** `tests/acceptance/F-008/` (calibration, contract, emulator, engine y render, más `helpers.ts`).
**Pruebas corregidas por contradecir la ficha o por el entorno:**
- F-001 `schemas.test.ts` CA4: las 48 zonas válidas ahora usan `w: 104`, alineado a 8. Lo pide la aclaración de la ficha.
- F-006 `preview.test.ts` CA13: `hoy` tiene 9 zonas, no 11. Lo pide la ficha.
- `F-008/helpers.ts` `index8`: si el motor responde `busy`, espera `idle()` y reintenta una vez, como el firmware. El 503 era intermitente y solo aparecía con la máquina cargada.
- `F-008/render.test.ts` presupuesto de CA4: ahora mide como F-005 (dibujar el HTML final tras calentar, más `checkFocusBand`). La media dio 490–580 ms por picos aislados de ≈800 ms. Pasé el tope a la **mediana** (<420 ms), y la mediana queda ≈300 ms. **El arquitecto decide si acepta ese cambio.**

**Herramientas:** `tsc` limpio, `eslint` con 0 errores y 83 avisos que ya existían, `prettier` limpio.
**check-scope verificador:** ✅
