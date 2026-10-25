# Informe del verificador · F-009 · fase «pruebas» (CA23)

**Veredicto: PRUEBAS LISTAS.**

- **CA23:** agregué la prueba «la hora guardada no envejece» en `tests/acceptance/F-009/state.test.ts`, en un `describe` nuevo.
  - Hace `cycle()` buenos a las 17:00Z, 17:01Z, 17:02Z, 17:03Z y 17:04Z con `stateFile`. Espera a que cada escritura termine y comprueba que `lastGood.readAt` del archivo sigue en `2026-10-24T17:00:00.000Z`.
  - Hace el `cycle()` de las 17:05Z y comprueba que `readAt` pasa a `2026-10-24T17:05:00.000Z`.
  - Crea una integración nueva con ese archivo a las 17:06Z y comprueba que su primera llamada trae `readAt` 17:05Z.
- **Resto de pruebas:** no toqué nada más.
- **`npm run typecheck`:** sin errores.
- **`tools/check-scope verificador --base main`:** OK.
- **Prettier:** el archivo cumple el formato.
- **ESLint:** da 78 errores `no-unsafe-*` en `state.test.ts`. Los atribuyo a que `trilium-tasks.ts` y `state.ts` todavía no existen, así que sus tipos no se resuelven; no verifiqué ninguna otra causa. Deberían desaparecer con el código. Los vuelvo a revisar en la fase «verificación».
- **Sin ejecutar:** no corrí la prueba, porque falla mientras no exista el código.
- **Commit:** no hice.

