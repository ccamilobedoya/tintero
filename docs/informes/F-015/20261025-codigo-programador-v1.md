## Informe del programador · F-015 · vuelta 1

**Hecho**
- **Franja:** `stripRow` y `titleRow(context, right?)` en `common.ts`, con `dropRight`. Las franjas de `task-board` usan `stripRow`, igual que antes. `titleRow` mide `strip`. `task-list` e `issue-list` pasan su cantidad de elementos. `agenda` pasa la cantidad de eventos sin festivos. El aviso «sin datos desde» reemplaza el texto de la derecha.
- **Mes:** el título propio del mes es una franja `MES AAAA` con el próximo festivo a la derecha, y solo si cabe entero.
- **Agenda:** opción `layout` (`days` o `column`). En `config.ts` otro valor da `ConfigError` con `must be days or column`. `dayLabel` está en `dates.ts`. Con `column` no hay filas de día y la columna de día lleva el texto solo en la primera fila de cada día.
- **D2:** en `task-board`, una fila que manda o una tarjeta sin `due` ni `category` mide `metaLine` menos y no dibuja la línea de detalle.
- **D3:** en `engine.apply`, `todo → doing → done → todo`. Quité el mapa `previousStage`. Las tareas sin etapa en `task-list` siguen alternando `done`.
- **Ejemplos:** `config/hoy.views.example.json` y `config/hoy.data.example.json`.
- **Documentación:** `server/README.md` y `config/README.md`.
- **Pruebas actualizadas:** `month-calendar`, `task-board` y `trilium-tasks`. Las del mes bajan 2 px en `y`. La de `task-board` pasa a 10 zonas y `hidden.tareas = 3`, y el ciclo necesita tres `toggle`. En `trilium-tasks`, el primer `toggle` escribe `En progreso`, el segundo `Hecho` y el tercero `Por hacer`.
- **Pruebas nuevas:** `strip.test.ts` (nuevo, de `dayLabel` y `layout`) y casos de columna en `agenda.test.ts`.

**Verificación**
- `typecheck`, `lint` (0 errores; hay 84 avisos en `tests/acceptance`, que no toqué), `npm test` (500 pasan, 2 saltadas), `format:check` y `tools/check-scope programador --base main`: todo limpio.
- No pude comparar píxeles contra los CA, porque no leo `tests/acceptance/`. Las coordenadas del mes (+2 px) sí cuadran con la regla 4. La geometría de las franjas, la columna de día, los 4 eventos y las 6 tareas de *Por hacer* no están comprobadas.

**`npm run test:acceptance`: 23 fallos, de tres tipos**
- **Esperados** (los de «Pruebas anteriores que cambian»):
  - F-006 CA3, CA4, CA6, CA8, CA9 y CA13.
  - F-008 CA4, CA5 y CA6.
  - F-009 CA7 (dos pruebas) y CA9.
  - F-013 CA6 (tres), CA8, CA9 y CA19.
  - F-013 CA20 y F-014 CA14, que corren las anteriores.
- **Conocidos** (la ficha dice que fallan igual en `main` sin `.git` ni configuración local): F-005 CA20 y F-007 CA6 no los nombra la ficha; F-014 CA13 sí. Esto último es una deducción mía, así que revísenlo.
- **F-005 CA20:** falló en la corrida completa y no en la suya sola. No lo nombra la ficha. Lo atribuyo a que dos pruebas anidadas corren las suites en paralelo.
- **F-005 CA27 (`busy` 503):** falló una vez al correr `tests/acceptance/F-005` sola y pasó entera (79 de 79) en la repetición. Parece intermitente por carga de Chromium, no un fallo de la ficha.

**Archivos fuera de la lista de la ficha:** ninguno. `strip.test.ts` es nuevo, pero es una prueba unitaria junto al código.

No hice commit. No dejé archivos temporales.
