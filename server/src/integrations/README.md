# server/src/integrations

Núcleo mínimo de integraciones (F-009, ADR-0040 a ADR-0043): lo que una integración pide y lo que el servidor concede.

- `manifest.ts`: lo que declara una integración (host, métodos y rutas, si lleva llave, escritura, cada cuánto lee) y los de `trilium-tareas` y `festivos`.
- `http.ts` (zona sensible): único cliente HTTP hacia integraciones y único `fetch`. Guarda la llave (la integración no la ve; con `needsKey: false` no lee llave ni manda `Authorization`), limita origen, métodos y rutas, tiempo y tamaño, y deja un registro por llamada sin contenido.
- `config.ts`: archivo de integraciones (`--integrations`), con tope de tamaño y sin campos desconocidos.
- `holidays-nager.ts`: festivos del país desde Nager.Date (F-013, ADR-0052): una consulta por país y año, caché en archivo (`stateFile`, 600, 30 días), reintento a la hora, `404` = país desconocido (24 h). Nunca bloquea el dibujo; los registros no llevan nombres de festivos.
- `state.ts`: archivo de estado (`stateFile`, ADR-0044): última lectura buena, estados conocidos y marcas pendientes, escrito de forma atómica con permisos 600 y tope de 1 MiB al cargar. **Guarda títulos de tareas** (privado) y se puede borrar sin perder nada de Trilium: solo las marcas aún no escritas. Un archivo dañado nunca impide arrancar.
- `trilium-tasks.ts`: lee el tablero Kanban de Trilium (ETAPI) cada 60 s, lo entrega al motor con `setSource` y escribe la marca *Hecho* sin pisar cambios hechos en Trilium.
