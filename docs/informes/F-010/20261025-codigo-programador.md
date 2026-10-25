## Informe del programador · F-010 · vuelta 1

**Estado:** listo para verificar, con un conflicto que detecté en la aceptación de F-005 (ver Dudas).

**Qué hice**
- `CHROMIUM_LABEL` y `--label tintero.chromium=1` antes de la imagen en `chromiumDockerArgs`.
- `parseContainerIds` (valida hex de 12 a 64 caracteres y lanza si no) y `removeOrphanChromium` (`docker ps -aq --filter label=…`, un solo `docker rm -f`, registra `orphans` solo si borró alguno).
- `startChromium` acepta `log?` y llama a `removeOrphanChromium` antes de lanzar su contenedor. `main.ts` le pasa `logEngine`.
- Pruebas unitarias de la etiqueta y de `parseContainerIds`. `removeOrphanChromium` no tiene prueba unitaria porque su contrato no permite inyectar `docker`; la cubre CA2 con Docker real.
- Sección «Como servicio (F-010)» en `server/README.md`.

**Archivos tocados**
- `server/src/engine/chromium.ts` y `server/src/engine/chromium.test.ts`
- `server/README.md`
- Fuera de la sección *Archivos*: `server/src/main.ts`, para pasar `log` a `startChromium`, como permitía el encargo.

**Comprobaciones:** typecheck ✅ · lint ✅ (0 errores) · test ✅ (374 pasan, 2 omitidas) · format ✅ · check-scope ✅
- `npm run test:acceptance` ❌. Hay 28 a 30 fallas en F-005, más 1 falla en F-007 que no es mía: F-007 pide haber corrido antes `tools/revisar` para tener `.revisar/semgrep.json`. F-005 `cycle` pasa corriéndola sola.

**Dudas o ambigüedades de la ficha**
- `tests/acceptance/F-005/render-hoy.test.ts:48` llama a `startChromium()` mientras el Chromium compartido de `helpers.ts` (`launchChromium`) sigue vivo.
- Ahora `startChromium` borra todo contenedor con la etiqueta, así que borra el compartido y las pruebas siguientes dan `index failed: busy`. Con `--no-file-parallelism` quedan 8 fallas, solo en ese archivo.
- La conducta es la que pide D3 y CA3, así que no la cambié. La prueba de F-005 tendría que usar otro mecanismo, y eso toca `tests/acceptance/`, que no es mío.
- Con archivos de prueba en paralelo, cada `startChromium` también borra el contenedor de los demás. Es el mismo problema.
- Hace falta decidir cómo se resuelve: ajustar las pruebas de F-005, o que `startChromium` reciba una opción para no limpiar. Esa opción no está en el contrato.

**Dependencias:** ninguna nueva

