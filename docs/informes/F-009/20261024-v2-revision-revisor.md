## Informe del revisor · F-009 · modo juicio · vuelta 2

**Veredicto:** APROBADO CON MEJORAS (5). Lo revisé leyendo el código y el diff. No ejecuté pruebas ni el resumen de `tools/revisar`.

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Resuelto de la vuelta 1:**
- **`.catch` en los `cancel()`:** quedaron en `http.ts` y `chromium.ts`.
- **Rutas por segmento:** `matchesPrefix` acepta el prefijo exacto, `/` o `?`.
- **Punteros de `columns`:** usan la posición, no el nombre (S6).
- **`stop()` y olvido:** `stop()` espera solo lo que está en curso. Las tareas que ya no aparecen en el tablero se olvidan, junto con su marca pendiente.

**Comprobado en `state.ts` y la persistencia:**
- **Escritura atómica:** el temporal queda en la misma carpeta con modo 600, más `chmod`, `fsync`, `rename` y `fsync` de la carpeta. Si algo falla, se borra el temporal.
- **Carga:** `loadState` nunca lanza. Con permisos abiertos, tamaño excedido o forma inválida devuelve `state: null` y el motivo. El tope de 1 MiB se mira con `fstat` y de nuevo con `readCapped`. Los límites de entradas y de texto se validan.
- **Una escritura a la vez:** la secuencia `again()` → `saveRunning=false` no tiene `await` en medio, así que no se pierde ningún cambio entre dos guardados.
- **Carreras con `stop()`:** `http` rechaza todo tras `stop()`. `stop()` espera la cola y `saving`, y un `write` en vuelo hace su `persist()` antes de salir de la cola.
- **S6:** el registro solo lleva `problem`, un código fijo. La ruta del archivo no aparece en registros ni en errores; el error de `main.ts` usa un puntero JSON.
- **Los `.catch` nuevos no esconden defectos:**
  - `prewarm()` no puede rechazar.
  - `draw` tiene su propio `try`.
  - `shutdown` no rechaza.
  - Los `cancel()` ya estaban cubiertos arriba.

**Mejoras** (se anotan en la ficha)
1. `trilium-tasks.ts` (`persist`): si `snapshot()` lanzara, `saveRunning` quedaría en `true` y nada se volvería a guardar, sin aviso. Conviene meter `snapshot()` dentro del `try`, o poner `saveRunning=false` en un `finally`.
2. `trilium-tasks.ts` (`runCycle`): el `catch` general manda a `readFailed` cualquier error, también los defectos de código (`setSource`, `persist`). Como el registro se limita a uno por hora, un defecto quedaría casi mudo. Conviene separar los errores de red/HTTP de los inesperados y registrar estos últimos siempre (regla 12).
3. `trilium-tasks.ts` (`write`): el `catch {}` registra `pending` sin el código del error, algo que sí hace `readFailed`. Esto ya venía de la vuelta 1.
4. `state.ts` (`saveState`): el temporal es `file.tmp-<pid>` y se abre con `"w"`, lo que sigue enlaces simbólicos. Con `"wx"` (y borrar un resto previo) no seguiría un enlace plantado. El riesgo es bajo porque la carpeta es privada y la valida `main.ts`.
5. `state.ts` (`loadState`): entre `fstat` y `readCapped` el archivo se abre dos veces. No es explotable, porque `readCapped` vuelve a limitar el tamaño. Se puede dejar así o leer desde el mismo descriptor.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- `.catch(() => undefined)` o `catch {}` sin registrar nada, repetido en varios archivos. Propuesta: regla de `semgrep` que exija un comentario `// why:` o un registro en cada catch vacío. Podría ser demasiado ruidosa, así que el arquitecto decide.

