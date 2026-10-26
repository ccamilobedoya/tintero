Informe del verificador — F-015, vuelta 2 (verificación)

**Veredicto: VERIFICADO.** Los CA de F-015 pasan, F-014 CA13 reformulado pasa, y no cambió código de producción.

- **Cambio hecho:** reescribí solo la prueba de CA13 en `tests/acceptance/F-014/previous.test.ts` con la propiedad que aclaró el arquitecto. Dejé un comentario que dice que la aclaró F-015. Quité de ese archivo el código que solo servía a la comparación píxel a píxel.
- **Qué comprueba ahora CA13:** monta el motor real con `config/views.example.json` y `config/data.example.json`, con hora 2026-10-23T12:00Z, en P124 y V124. En cada bloque `agenda` exige que no haya `<svg` y que `grid-template-columns` no traiga columna de pictograma (nada del tipo `Npx`, `minmax(0,1fr)` presente y como máximo 3 pistas). Exige al menos un bloque `agenda` por panel. Las 2 pruebas (P124 y V124) pasan.
- **F-015, corrida sola:** 5 archivos, 45 de 45 pasan.
- **F-014 sin `previous.test.ts`:** 5 archivos, 61 de 61 pasan.
- **`previous.test.ts` solo:** 5 de 5 pasan, incluidas CA13 (reformulada), CA14 y CA15.
- **Fallo intermitente de CA14:** en la corrida conjunta de F-015 y `previous.test.ts` falló una vez CA14. CA14 vuelve a correr F-005, F-006, F-008, F-009 y F-013, y falló `F-005/engine.test.ts:217` (un `index` devolvió `ok: false`). Cuatro Chromium en paralelo sobrecargaron la máquina. Al correr `previous.test.ts` solo, CA14 pasó. No cambié nada del código ni de la prueba.
- **F-002 CA21:** no lo repetí, como indicaste (lo corrió el arquitecto: 2 de 2).
- **`npm test`:** no lo repetí en esta vuelta, porque no cambió código de producción.
- **Herramientas:** `npx tsc --noEmit -p tests/acceptance` sin errores. `npx eslint tests/acceptance` da 0 errores y 85 avisos de `security/detect-*` que ya estaban. `tools/check-scope verificador --base HEAD` está dentro del alcance. No hice commit.
