## Informe del revisor · F-011 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (5)

No hay bloqueantes. Revisé el diff leyendo el código y no ejecuté nada. `tools/revisar` salió limpio, y los hallazgos de eslint listados son de `tests/acceptance/` anteriores a esta rama.

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Comprobado y correcto**
- **Relanzamiento de Chromium.**
  - `restarting` garantiza uno a la vez.
  - Solo se borra el contenedor propio con `rm -f <name>`; el nombre se valida con `CONTAINER_NAME`.
  - Los huérfanos se borran con los filtros de etiqueta de la instancia.
  - `stop()` marca `stopped`, aborta la señal, espera `restarting` y detiene el contenedor.
  - Si `stop()` llega mientras se levanta uno, `isStopped()` lo detiene antes de asignarlo.
- **`waitForDocker`.**
  - La espera crece de 1 s a 60 s con tope.
  - La señal corta la espera con `sleepUnless` y se revisa en cada vuelta.
  - Cada sonda tiene tiempo de espera de 10 s.
  - Registra la primera falla y luego una por hora.
- **`--pull never`.** Se agrega antes de la imagen en `chromiumDockerArgs`, y el resto del endurecimiento de ADR-0031 no cambió. `bringUp` verifica además con `image inspect` y registra `image-missing`.
- **`fatal.ts`.**
  - Solo registra `kind`, sin mensaje ni pila.
  - Corre una sola vez (`handled`).
  - Tiene tope de 30 s.
  - El timer se limpia.
  - Si el registro falla, igual se apaga y se sale.
  - `exit(1)` ocurre siempre.
- **R2 (5), `loadState`.**
  - Abre, hace `fstat`, revisa `isFile` y el modo 077, y luego mide `size` y lee con `readSync` sobre el mismo descriptor.
  - La lectura está acotada a `MAX+1` bytes y corta en cuanto se pasa del tope, así que no depende de `stat.size`.
  - El `closeSync` está en `finally`.
- **R2 (1)–(4).**
  - (1) `persist` libera `saveRunning` en un `finally`.
  - (2) Los errores que no son de red ahora se registran siempre como `defect`, sin mensaje ni pila.
  - (3) La línea `pending` lleva `code`.
  - (4) `saveState` borra el temporal y abre con `"wx"`, que no sigue enlaces, y la creación es atómica.

**Mejoras** (se anotan en la ficha)
1. `chromium.ts`, `supervise`: el `.catch(() => undefined)` que cierra la cadena de `restarting`, y el de `old.close()`, esconden defectos (regla 12). Si `bringUp` lanzara algo inesperado, `container` e `inner` quedarían en `undefined` y `supervise` retornaría para siempre, así que el servicio quedaría muerto sin registro. Corrección: registrar `{event:"defect", where:"chromium-restart"}` sin mensaje en esos `.catch`, y poner `restarting` en un estado que permita reintentar.
2. `chromium.ts`, `bringUp`: si el contenedor arranca bien y muere enseguida, `attempt` vuelve a 0 y cada fallo de `render` reinicia sin espera. No es un bucle apretado, porque lo frenan las peticiones y el arranque de varios segundos, pero tampoco hay espera creciente. Corrección: mantener una espera mínima entre reinicios consecutivos, por ejemplo con `lastRestartAt`.
3. `chromium.ts`, `runChromium`: si `docker run` agota su tiempo de espera, el contenedor puede quedar vivo. Sin `instance`, `removeOrphanChromium` no se llama y esos contenedores se acumulan en cada reintento. Corrección: tras un fallo de `docker(run)`, hacer `rm -f <name>` (el nombre es propio).
4. `chromium.ts`, `supervise`: solo reinicia si el contenedor no corre. Un Chromium vivo pero con el CDP roto sigue fallando sin recuperación. Si la ficha solo exige cubrir la muerte del contenedor, queda como nota.
5. `chromium.ts`: si `renderer.close()` se llama durante `bringUp`, el `inner` recién creado no se cierra (conexión CDP abierta hasta `stop()`). `main.ts`: un SIGTERM y un fatal simultáneos pueden ejecutar `shutdown` dos veces. Ambos casos tienen poco efecto, y conviene anotarlos.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- `.catch(() => undefined)` que se traga defectos (mejora 1, y ya antes en F-009) → regla `semgrep` `tintero-catch-vacio-en-promesa` que avise de `.catch(() => undefined)` fuera de `stop`/`close`/limpieza, con comentario de excepción obligatorio.

