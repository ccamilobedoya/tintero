## Nota del arquitecto · F-003 · programador

- **Vuelta 1:** la primera corrida se cortó por el límite de uso de la cuenta; la segunda continuó el trabajo, pero dejó un servidor en una tarea en segundo plano y su sesión se reabrió al terminar: `claude -p` devolvió solo el último mensaje, así que **su informe se perdió** (lección: los agentes no usan tareas en segundo plano).
- **Comprobación del arquitecto en su lugar:** `typecheck` ✅ · `lint` 0 errores (avisos que luego bloquearon el commit) · **170 pruebas** pasan · `format:check` ✅ · `contract:check` ✅ · `check-scope programador` ✅ · única dependencia nueva `fastify` 5.12.7.
- **Vuelta 2:** 7 avisos de eslint de `server/` justificados como falsos positivos (`security/detect-object-injection` con índices acotados o claves fijas); script `lint` con `--max-warnings 0` para el código de producción.
