## Informe del revisor · F-009 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (4). No encontré bloqueantes. Revisé el código y los informes de las herramientas, pero no ejecuté pruebas propias.

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Lo que comprobé y está bien**
- **I1:** la llave solo se lee dentro de `http.ts`. `trilium-tasks.ts` recibe un `GuardedHttp`, nunca el token. Los errores llevan solo el código y no incluyen la causa (`cause`).
- **Llave:** se abre y se revisa con `fstat` (archivo regular, permisos `0o077`). El tope de 4096 bytes se aplica antes de leerla con `readCapped`.
- **I2 / D11:** `parseBase` exige `https://`, o `http://127.0.0.1:<puerto>`. Rechaza usuario, contraseña, `?` y `#`. Con `url.origin !== checked.origin` se evita escapar del origen. Los redirects dan error (`redirect: "error"`).
- **ADR-0043:** `checkPath`, la ruta y el método se validan antes del `fetch`, que es único. El PATCH exige `manifest.writes && allowWrite`.
- **I5:** `ownLabel` exige `a.noteId === note.noteId`, así que nunca se escribe un atributo heredado. El PATCH lleva solo `{value}` y solo sobre `status`.
- **I7 / S6:** el registro del cliente lleva `host`, `method`, `status` y `ms`, sin rutas, ids ni cuerpos. Los registros de la integración usan razones fijas. Los errores de configuración llevan el puntero JSON y la razón.
- **Topes:** respuesta de 1 MiB, contando también el flujo ya descomprimido y con `content-length` previo. Configuración de 64 KiB antes de `JSON.parse`. El tiempo de 5 s cubre el cuerpo, porque el temporizador se limpia en `finally`.
- **Motor:** el `onToggle` va en `try/catch` y el registro no lleva valores. En `tasks.onToggle` los fallos asíncronos los absorbe `enqueue`, que tiene `.catch`.
- **Fila de escrituras:**
  - Todo pasa por una cola serializada.
  - Si hay un toggle durante el `await`, `pending.get(id) === wanted` lo detecta y reencola.
  - Si el deshacer llega antes de escribir, `next === current` borra la escritura.
  - El PATCH fallido se reintenta y a las 24 h caduca.
  - `pending` no puede crecer sin límite, porque solo admite ids ya conocidos (máximo 500).
- **Excepción:** el `fetch` coincide con lo que dice `docs/seguridad.md` y lleva el `nosemgrep` marcado.

**Mejoras** (se anotan en la ficha)
1. `http.ts:125,137,184` — `void response.body?.cancel()` y `void reader.cancel()` no atrapan el rechazo. Si el temporizador aborta justo en ese momento, la promesa puede rechazar sin manejar. En Node 24 eso tumba el proceso. Se corrige con `.catch(() => undefined)` en las tres llamadas.
2. `http.ts:148-150` — `path.startsWith(route.prefix)` con `"/notes"` también acepta `/notesXYZ`. Es inofensivo, porque el origen y el servidor limitan el daño, pero conviene ajustar el prefijo a `"/notes/"` más una ruta exacta `/notes?`, o comparar por segmento.
3. `config.ts:48,66` — el puntero de error incluye el nombre de la clave del archivo (columna o campo desconocido). Es un valor del archivo, aunque es la clave y no un secreto. Para ser estrictos con S6 se puede recortar o usar solo el índice.
4. `trilium-tasks.ts` (`stop`) — espera a `idle()` sin cancelar la cola. Con varias escrituras pendientes y Trilium lento puede pasar los 6 s del paso de cierre. El apagado lo acota con `timeoutMs`, así que no es grave. Podría ponerse un `signal` de cancelación. También se puede limpiar `known` de las tareas que ya no existen.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- `void promesa.cancel()` sin `.catch` → regla de `eslint` `@typescript-eslint/no-floating-promises`, con `ignoreVoid: false`, para exigir manejar el rechazo. Es candidata solo si el arquitecto quiere endurecerla.

