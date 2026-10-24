## Informe del verificador · F-006 · fase verificación · vuelta 1

**Veredicto:** CUMPLE

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PASA | `config.test.ts` y `engine.test.ts`: `stageOf` da `done` para `t-002` y `todo` para las demás. F-001 a F-005 pasan por separado (F-005: 11 archivos, 79 pruebas). En la corrida completa falló una vez F-005 CA27 (ver nota). |
| CA2 | PASA | `config.test.ts`: todos los casos inválidos lanzan `ConfigError` con ruta JSON y sin títulos. |
| CA3 | PASA | `render.test.ts`: sin desbordes, sin zonas pequeñas, sin grises. Zonas, `hidden` y píxeles coinciden con la ficha. |
| CA4 | PASA | `render.test.ts`: la fecha vencida de `b-02` sale invertida y las filas de `b-06` y `b-04` quedan en blanco. |
| CA5 | PASA | `engine.test.ts`: `hechas` tiene `b-12` y `b-13`. Pasada la medianoche cambia la huella y se dibuja `Nada hecho hoy.` |
| CA6 | PASA | `engine.test.ts`: marcar, deshacer (la huella vuelve a la inicial), repetir un `id` da `duplicate`, y los `renders()` suben en 2. |
| CA7 | PASA | `render.test.ts`: sin tareas *doing*, la primera zona es `b-02` en `{10, 133, 476, 24}`. |
| CA8 | PASA | `render.test.ts`: zonas y `hidden` de `tablero` en P124 coinciden con la ficha. |
| CA9 | PASA | `render.test.ts`: `hoy` y `tablero` en V124 y P200 sin desbordes ni zonas pequeñas. Zonas y `hidden` de `hoy` en V124 coinciden. |
| CA10 | PASA | `engine.test.ts`: `staleLabel` da `sin datos desde 11:50`, `undefined` a los 5 min justos y `undefined` sin `readAt`. En el motor, `changed: false` en ambos casos, con huella de `hoy` sin cambio a las 16:57Z y cambiada a las 16:50Z. |
| CA11 | PASA | `engine.test.ts`: el orden es `c-1`, `c-3`, `c-2` con categorías y `c-1`, `c-2`, `c-3` con `group_by: "none"`. |
| CA12 | PASA | `engine.test.ts`: con la fuente `readonly`, las zonas son `open`, no hay casilla y `toggle` da `stale`. |
| CA13 | PASA | `preview.test.ts`: `npm run render` sale con 0 y escribe `hoy.png` y `tablero.png`. |

**Pruebas:** `tests/acceptance/F-006/` (`config`, `engine`, `preview`, `render`: 34 pruebas, todas pasan). `npm test` da 36 archivos pasados y 1 omitido, 322 pruebas pasadas y 2 omitidas.

**Pruebas corregidas por contradecir la ficha:** ninguna. Sí ajusté una cosa de infraestructura: el `afterAll` de `render.test.ts` que cierra los motores se agotaba a los 10 s (el tope por defecto). Le puse 120 s. Las 9 pruebas de render ya pasaban; eso no cambia lo que se comprueba.

**Fuera de F-006:**
- F-007 CA6 falla, como se anticipó: necesita `tools/revisar`.
- F-005 CA27 («tres motores… no da busy») falló una vez en la corrida completa, que corre los archivos en paralelo y con carga. Corrida sola, F-005 pasa entera. Parece una prueba sensible al tiempo bajo carga, y no la tocó F-006.

**tsc, eslint y check-scope verificador:** ✅. Las tres herramientas salen sin errores.

**Render en navegador:** las pruebas de render usan Chromium real y corrieron. El aviso de `playwright`/`browser: no` del preflight no las afectó.
