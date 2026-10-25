**Informe del programador · F-009 · vuelta 3**

- **Resultado:** CA23 está implementado. Con el tablero sin cambios, el archivo de estado también se guarda cuando la lectura buena tiene un `readAt` al menos 5 min posterior al `lastGood.readAt` guardado.
- **Cambio en el código:** en `server/src/integrations/trilium-tasks.ts` añadí la constante `REFRESH_SAVED_MS` (5 min). La condición de guardado de `runCycle` ahora es `key !== lastKey || forgot || aged`.
- **Prueba nueva** en `server/src/integrations/trilium-tasks.test.ts`, con los valores de CA23:
  - Ciclos a las 17:00Z, 17:01Z, 17:02Z, 17:03Z y 17:04Z: el archivo conserva `readAt` 17:00Z.
  - Ciclo a las 17:05Z: el archivo pasa a 17:05Z.
  - Una integración nueva a las 17:06Z entrega `readAt` 17:05Z.
- **Verificación:**
  - `typecheck`, `npm test` (368 pasan, 2 omitidas), `format:check` y `tools/check-scope programador --base main` pasan.
  - `npm run test:acceptance` pasa: 380 de 380.
  - `npm run lint` da 1 error y 71 avisos. No inspeccioné el error. Sigue el aviso de tu encargo sobre `tests/acceptance/F-002/testserver.ts`, que el verificador ya arregló en su rama.
- **Riesgos 1 y 3:** sin cambios.
- **Archivos tocados:** solo `trilium-tasks.ts` y `trilium-tasks.test.ts`. No hice *commit*.

