**Informe del programador — F-018, vuelta 4**

Las tres mejoras están hechas. `typecheck`, `lint` (0 errores), `npm test` (547 pasan, 2 omitidas), `format:check` y `tools/check-scope programador --base arq/F-018` pasan.

1. **`pki.ts`, subcomando `firmware` (R15):**
   - El nombre del temporal `<destino>.<hex>.tmp` ahora se calcula antes de escribir nada. Se comprueba con `git check-ignore` tanto el destino como el temporal.
   - Si el destino está dentro del repo y git no ignora el temporal, sale con 2 y no escribe nada. No cambié el nombre del temporal.
   - Con el destino por defecto no cambia nada, porque `.gitignore` ya ignora `firmware/include/*.tmp`.
   - Si falla la escritura o el `rename`, el `catch` ya borraba el temporal con `rmSync`. No hizo falta cambiarlo.
   - **Prueba nueva** en `pki.test.ts`: `--out` a `<repo>/tintero-fw-test.log`, que `*.log` ignora pero su temporal `.log.<hex>.tmp` no. Verifica código 2, que no existe el destino y que no queda ningún temporal en la raíz del repo. No agregué una prueba aparte para el borrado del temporal cuando falla el `rename`, porque ese camino no cambió.
2. **`certificates.md` (en y es):** en «Test with the emulator» / «Probar con el emulador» añadí que el puerto del `--server` del emulador debe ser el mismo `--port` del servidor (8443 en el ejemplo). Si 8443 está ocupado, se usa otro en los dos.
3. **`CONTRIBUTING.md` y `CONTRIBUTING.es.md`:** añadí una línea que dice que los hooks se saltan con `git commit --no-verify`, que eso no se hace, y que antes de publicar se corre `tools/revision-publicacion` (revisa árbol e historia sin depender de los hooks).

No toqué archivos fuera de la ficha ni dejé temporales.
