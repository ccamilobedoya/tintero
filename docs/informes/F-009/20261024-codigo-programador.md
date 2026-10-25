## Informe del programador · F-009 · vuelta 1

**Estado:** listo para verificar. Con dos pendientes: no pude correr `tools/revisar` y no escribí pruebas del arranque del servidor.

**Qué hice**
- Escribí `manifest.ts`, `http.ts`, `config.ts` y `trilium-tasks.ts` según el *Contrato*. `http.ts` tiene un único `fetch`, marcado con `nosemgrep` como pide `docs/seguridad.md`.
- Agregué `onToggle` y `ToggleChange` en `engine.ts`, y `--integrations` en `args.ts` y `main.ts`.
- En `main.ts`, la configuración, la comparación con los datos (D15) y la llave se validan antes de arrancar Chromium. Los errores salen con 2 y muestran la ruta JSON o el código, nunca el valor. `stop()` entra en el apagado antes del motor.
- Escribí pruebas unitarias con mi propio ETAPI falso (`testing.ts`), más `config/integrations.example.json`, el README de `integrations/` y la sección R3 en `server/README.md`.

**Archivos tocados**
- `server/src/integrations/{manifest,http,config,trilium-tasks}.ts` y sus `*.test.ts` (los tres con pruebas: http, config, trilium-tasks)
- `server/src/engine/engine.ts`, `server/src/args.ts`, `server/src/main.ts`, `server/README.md`
- `config/integrations.example.json`, `server/src/integrations/README.md`
- Fuera de la sección *Archivos*: `server/src/integrations/testing.ts`. Es el ETAPI falso y la llave de prueba, compartidos por tres archivos de prueba; sigue el precedente de `engine/testing.ts`.
- `config.ts` exporta además `checkAgainstData` (valida D15 y el tipo de la fuente), `DEFAULT_COLUMNS` y `parseIntegrations`.

**Comprobaciones:** typecheck ✅ · lint ✅ (`eslint --max-warnings 0 server contract emulator tools` sin avisos; los avisos que salen son de `tests/acceptance`, ya existentes) · test ✅ (351 pasan, 2 omitidas) · format ✅ · check-scope ✅

- `npm run test:acceptance`: 379 de 380 pasan. En la primera corrida falló además otra prueba; no la identifiqué y en la segunda pasó, así que puede ser inestable bajo carga.
- La que sigue fallando es `F-007/docs-and-scan` CA6. Exige `.revisar/semgrep.json`, que lo genera `tools/revisar`.
- ❌ No pude correr `tools/revisar --base main` ni `semgrep`: el entorno pide aprobación para ambos. Mi código no usa `readFileSync`; todas las lecturas pasan por `readCapped`. Hay que correr `tools/revisar` fuera de aquí.
- ❌ No escribí pruebas de que `main.ts` salga con 2 (CA11). Quedan para la verificación de aceptación.

**Dudas o ambigüedades de la ficha**
- Ficha: `skipped` solo para tarjetas que no entran. Yo dejo `read ok:false` solo si falla la lectura y no registro lecturas buenas.
- El orden de las razones de omisión sigue la ficha: sin `status`, `status` desconocido, archivada, título vacío, *Hecho* viejo, demasiadas. Si el `utcDateModified` de una *Hecho* no se puede leer, la omito como `old-done`.

**Dependencias:** ninguna nueva

