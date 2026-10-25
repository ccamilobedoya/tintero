# server/src/integrations

Núcleo mínimo de integraciones (F-009, ADR-0040 a ADR-0043): lo que una integración pide y lo que el servidor concede.

- `manifest.ts`: lo que declara una integración (host, métodos y rutas, escritura, cada cuánto lee) y el de `trilium-tareas`.
- `http.ts` (zona sensible): único cliente HTTP hacia integraciones y único `fetch`. Guarda la llave (la integración no la ve), limita origen, métodos y rutas, tiempo y tamaño, y deja un registro por llamada sin contenido.
- `config.ts`: archivo de integraciones (`--integrations`), con tope de tamaño y sin campos desconocidos.
- `state.ts`: archivo de estado (`stateFile`, ADR-0044): última lectura buena, estados conocidos y marcas pendientes, escrito de forma atómica con permisos 600 y tope de 1 MiB al cargar. **Guarda títulos de tareas** (privado) y se puede borrar sin perder nada de Trilium: solo las marcas aún no escritas. Un archivo dañado nunca impide arrancar.
- `trilium-tasks.ts`: lee el tablero Kanban de Trilium (ETAPI) cada 60 s, lo entrega al motor con `setSource` y escribe la marca *Hecho* sin pisar cambios hechos en Trilium.
