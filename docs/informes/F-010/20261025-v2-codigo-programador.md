# Informe · programador · F-010 · vuelta 2

**Resultado:** hecho, con un fallo de aceptación que no viene de mi cambio.

**Cambios**
- `chromium.ts`:
  - Exporta `INSTANCE_NAME`.
  - `chromiumDockerArgs(..., instance?)` añade `--label tintero.instance=<instance>` antes de la imagen y lanza si el nombre no casa.
  - `removeOrphanChromium(instance, options)` valida la instancia antes de llamar a `docker` y filtra con las dos etiquetas.
  - `startChromium({ instance, log })` solo limpia cuando recibe `instance`. Sin ella no borra nada.
- `args.ts`: opción `--instance`. Si el nombre no casa con `INSTANCE_NAME` lanza `UsageError`, así que `main.ts` sale con 2.
- `main.ts`: pasa `instance` a `startChromium` y la añade al texto de uso. Con `--chromium` (uno externo) no se llama a `startChromium`, así que no se borra nada.
- `server/README.md`: el servicio usa `--instance servicio`, y el comando de verificación tras reiniciar filtra por las dos etiquetas.
- Pruebas unitarias nuevas en `chromium.test.ts` y `args.test.ts`: etiqueta de instancia, nombres inválidos, rechazo antes de `docker` y `--instance`.

**Comprobaciones**
- `typecheck`, `lint` (solo avisos), `format:check` y `tools/check-scope programador --base main`: pasan.
- `npm test`: 377 pruebas pasan, 2 saltadas.
- `npm run test:acceptance`: 450 pasan y falla 1 de 451. Falla `F-007/docs-and-scan.test.ts` (CA6) porque falta `.revisar/semgrep.json`, que genera `tools/revisar --base main`. F-005 pasa entero.

**Pendiente**
- No generé `.revisar/` porque no es mi carpeta, y no corrí `tools/revisar`. Hay que correrlo antes para que ese CA6 pase.
- No probé contra Docker real el caso de dos instancias (CA3). Eso lo cubre la aceptación y el CA6 en vivo del arquitecto.

