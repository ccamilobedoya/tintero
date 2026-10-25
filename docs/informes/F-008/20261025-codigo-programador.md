## Informe del programador · F-008 · vuelta 1

**Estado:** listo para verificar. Hay pruebas de aceptación de fichas anteriores que fallan por geometría, más allá de las que la ficha declara (ver *Dudas*).

**Qué hice**
- Contrato:
  - Agregué `unaligned`, `focus_pad`, `focus`, `Tintero-View`, `checkFocusBand` y los 4 ejemplos nuevos.
  - Regeneré el schema y el OpenAPI.
- Motor y bloques:
  - Medidas nuevas del tema y columna de foco alineada a 8 px.
  - Banda en blanco, filas y `card` con las alturas nuevas, y tachado de `line` px.
  - `bandInk`, `focus`, `index(…, { view })` y `fullRefresh` diario, más el bloque `calibration` con sus ejemplos.
- `app.ts` lee `Tintero-View`, pone `full_refresh` y `focus`. El emulador manda `Tintero-View`, dibuja el anillo punteado y el foco sigue a la zona.
- Documenté en `server/README.md`, `contract/README.md` y `firmware/README.md` (sección 9, *Foco y acciones*).
- Con `npm run render` y los ejemplos del tablero (P124), las zonas coinciden con CA4 y CA5. Los píxeles que revisé de CA4 y CA11 coinciden. No medí los presupuestos de tiempo de dibujo.

**Archivos tocados**
- Los de la sección *Archivos* de la ficha, más pruebas nuevas: `contract/src/focus.test.ts`, `emulator/src/focus.test.ts`, `server/src/engine/focus.test.ts` y `server/src/engine/blocks/calibration.test.ts`.
- Pruebas unitarias existentes actualizadas: `validate.test.ts`, `theme.test.ts`, `view.test.ts`, `engine.test.ts`, `task-board.test.ts` y `server/scripts/render.test.ts`.
- Fuera de la sección *Archivos*:
  - `server/src/engine/testing.ts`: las cajas del `Renderer` falso ahora salen alineadas a 8 px.
  - `server/src/views.ts`: alineé las zonas de la demostración de F-003 a 8 px, porque el emulador y `validateZones` las rechazaban.
  - `server/src/app.test.ts`: sin cambios netos.
- Dejé el `tests/acceptance/` sin tocar.

**Comprobaciones:** typecheck ✅ · lint ✅ en `server contract emulator tools`; ❌ en `eslint tests`, 78 avisos, todos en `tests/acceptance` (no los revisé contra `main`) · test ✅ (416 + 2 omitidas) · format ✅ · contract:check ✅ · check-scope ✅ · test:acceptance ❌ (20 fallos, abajo).

**Dudas o ambigüedades de la ficha**
1. **`checkFocusBand` dice «Negro = bit 0 (como en F-001)».** F-001, ADR-0020, `toRaw1` y el firmware dicen **1 = negro**. Implementé 1 = negro; si CA2 se escribe con 0 = negro, fallará.
2. **Fallos de aceptación fuera de la lista declarada.** Son de geometría o de la regla `unaligned`, y no se arreglan en el código sin romper la ficha:
   - F-001 CA4: sus 48 zonas no están alineadas.
   - F-003 CA2 y CA5: la demostración tenía `x = 20`; ahora sale en 16. F-003 CA7 pasó tras alinear la demostración.
   - F-005 CA21: «13 zonas».
   - F-005 CA23: un píxel fijo.
   - F-006 CA13: 11 → 9 zonas.
3. **Dependen del entorno.**
   - F-007 CA6 pide `.revisar/semgrep.json`, que no existe aquí.
   - F-005 CA27 (tres motores, sin `busy`) pasó en aislado, pero falló en una de las dos corridas completas.
4. **Cambio de comportamiento por las filas más altas.**
   - En `hoy` (datos de F-005): `hidden` pasa a `{pendientes: 6, eventos: 1, jira: 3}` y quedan 10 zonas.
   - `jira` queda `tooSmall` en V124 (el mínimo es 122 px y la franja mide ~115) y en P200.
   - El mes en P200 (`hoy` del tablero) también queda `tooSmall`.
   - La hoja `calibracion` desborda a 200 ppp (mide ~75 mm de alto); en 124 ppp no.
5. **Ajustes que hice por mi cuenta.**
   - `month-calendar` centra con desplazamientos enteros. Con el centrado anterior salían 8 píxeles grises (`gray = 8`) en `hoy` de F-005.
   - El archivo de datos acepta `sources: {}` solo si ninguna vista usa fuente.
   - La etiqueta de vencida arranca a 3 px del contenido en las filas pequeñas, para dar los 296–309 de CA4.

**Dependencias:** ninguna nueva.
