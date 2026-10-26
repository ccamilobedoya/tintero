**Informe del programador · F-014 · vuelta 1**

**Estado:** listo para verificar

**Qué hice**
- Datos y bloque: `Icon`/`ICONS`, `icon` y `calendar` en `CalendarEvent` (con puntero de error) y la opción `holidays` de `agenda`. Los seis pictogramas están en `pictograms.ts`. `agenda` gana la columna de pictogramas (`texto + 6` px) y las filas de festivo con estrella, que no son zona.
- `requestText` está en `http.ts` y reusa las guardias de `request` (ambas llaman a la misma función interna).
- La integración `ical-calendario` está completa:
  - `parseCalendar`, `mergeCalendars` y `createIcalCalendars`, con estado a disco (600, atómico).
  - `loadCalendars` (permisos 600, 32 KiB) y su entrada en `integrations.json`.
  - `main.ts` la carga antes de Chromium y la detiene en el apagado.
- Para no repetir la lectura cuadrática de `ical.js`, `ICAL.Event` se crea con `exceptions: []` y las excepciones se relacionan a mano por UID. `ical.js` relaciona excepciones de cualquier UID y escanea todo el archivo por cada evento. Con 20 000 eventos (~7 MB) leer tardó ~0,8 s; el tope es 3 s.
- Dependencia: `ical.js@2.2.1` exacta en `package.json`.

**Archivos tocados**
- Creados: `server/src/engine/blocks/pictograms.ts` (+ test), `server/src/engine/blocks/agenda.test.ts`, `server/src/integrations/ical-calendar.ts` (+ test), `config/agenda.views.example.json`, `config/agenda.data.example.json`, `config/calendarios.example.json`.
- Modificados: `engine/config.ts` (+ test), `engine/blocks/agenda.ts`, `integrations/http.ts` (+ test), `integrations/manifest.ts`, `integrations/config.ts` (+ test), `main.ts`, `config/integrations.example.json`, `package.json`, `package-lock.json`, y los README de `config/`, `server/` e `integrations/`.
- Fuera de *Archivos*: `server/src/integrations/trilium-tasks.ts`. Su envoltura de `GuardedHttp` necesitaba el miembro nuevo `requestText` para compilar; añadí 4 líneas con la misma guardia de «detenido».

**Comprobaciones:** typecheck ✅ · lint ✅ (0 avisos en `server`; los avisos de `tests/acceptance` ya existían) · test ✅ (491 pasan, 2 omitidas) · format ✅ · check-scope ✅ (base `ficha/F-014`).

**Aceptación de fichas anteriores**
- Con todo el lote fallaron 4, ninguna por esta ficha:
  - F-007 CA6: falta `.revisar/semgrep.json`, que se genera con `tools/revisar`. Es de entorno.
  - F-005 CA27 (el intermitente conocido) y F-005 CA20 SIGTERM: corridas solas pasan las dos (14 de 14 pruebas).
  - F-013 CA20: es la prueba que vuelve a lanzar F-005, así que cayó por esas dos.
- No pude correr `npm audit signatures`: el entorno pide aprobación para ese comando. Queda pendiente (CA15). `package.json` tiene `"ical.js": "2.2.1"` sin `^` ni `~`.
- Sin Chromium no comprobé los píxeles de CA10 a CA13. Las pruebas del HTML sí coinciden con las coordenadas de la ficha: 8 zonas el 27-oct, 2 zonas el 1-nov con festivo y 2 sin él.

**Dudas o ambigüedades de la ficha**
1. Las 2 000 repeticiones (R3) las conté por cada paso del iterador, incluidos los anteriores a la ventana. Es la única forma de que «diario sin fin → `truncated > 0`» pase con una ventana de 93 días. Un evento diario que empezó hace más de ~5,5 años se corta antes de llegar a la ventana. La alternativa es saltar rápido hasta la ventana; dime si la prefieres.
2. En la fila de festivo, la columna de hora dice «Todo el día» y el nombre va en el título. La ficha dice «fila de día completo» y no fija más.
3. Un TZID sin `VTIMEZONE` se resuelve como zona IANA si es válida; una hora flotante se toma en la zona de la configuración.

**Dependencias:** `ical.js@2.2.1` (permitida por la ficha)

