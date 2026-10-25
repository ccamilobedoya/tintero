## Informe del programador · F-011 · vuelta 1

**Estado:** listo para verificar

**Qué hice**
- `waitForDocker` y `startChromiumService` en `chromium.ts`: espera creciente (1 s hasta 60 s), `image inspect` antes de arrancar (`image-missing`, `start`), relanzamiento con `inspect` + `rm -f` + `restart` (uno a la vez), y `--pull never` antes de la imagen. Un `Renderer` envolvente cambia de dirección y rechaza enseguida mientras relanza.
- `fatal.ts` (`installFatalHandlers`, tope de 30 s, sale con 1) instalado en `main.ts`. Sin `--chromium`, `main.ts` espera a `startChromiumService` antes de escuchar. `{"listening"}` sale después.
- R2 (los 5 puntos) en `state.ts` y `trilium-tasks.ts`. R3 y la lista de chequeo del apagón en `server/README.md`.
- Pruebas unitarias de todo: Docker falso en una carpeta temporal para CA1 y CA3, y pruebas de `fatal`, `saveState` con enlace plantado y `defect`/`pending`.
- Prueba en vivo con Docker real (archivo temporal, ya borrado): `docker kill` → el mismo proceso dibujó de nuevo y quedó 1 contenedor de esa instancia. No medí el tiempo de recuperación.

**Archivos tocados**
- `server/src/engine/chromium.ts` y `chromium.test.ts` — servicio, espera, `--pull never`. `startChromium` ahora delega en un `runChromium` interno.
- `server/src/engine/index.ts` — exporta `startChromiumService`, `waitForDocker` y `ChromiumService`.
- `server/src/fatal.ts` y `fatal.test.ts` — nuevos.
- `server/src/main.ts` — servicio, manejadores fatales y `allSteps()` para el apagado.
- `server/src/integrations/{state,trilium-tasks}.ts` y sus pruebas — R2.
- `server/README.md` — R3, recuperación y lista de chequeo.
- Fuera de la sección *Archivos* de la ficha: ninguno. `engine/index.ts` es una exportación mínima.

**Comprobaciones:** typecheck ✅ · lint ✅ (0 errores; los avisos son de `tests/acceptance`, que no es mío) · test ✅ (390 pasan, 2 omitidas) · format ✅ · check-scope ✅
- `npm run test:acceptance`: 463 de 464 pasan. Falla solo F-007 CA6, porque falta `.revisar/semgrep.json`. No corrí `tools/revisar`.

**Dudas o ambigüedades de la ficha:**
- El contrato de `startChromiumService` no incluye `instance`. Añadí `instance?: string` opcional (`main.ts` lo necesita para borrar los huérfanos de F-010).
- Uso `docker image inspect --format {{.Id}} <imagen>` para acotar la salida; la ficha dice solo `docker image inspect <imagen>`.
- Si `sleep` rechaza, `startChromiumService` rechaza con ese error. Lo uso en la prueba de CA3 para cortar la espera.
- `waitForDocker` rechaza con `Error("aborted")` cuando se aborta la señal.

**Dependencias:** ninguna nueva

