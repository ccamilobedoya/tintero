**Informe del programador — F-014, vuelta 3**

**Resultado:** CA4 / R6 corregido. Pasan `typecheck`, `lint` (0 errores; las 83 advertencias no las toqué), `npm test` (494 pruebas pasan, 2 omitidas), `format:check` y `check-scope programador --base ficha/F-014`.

**Cambios:**
- `server/src/engine/dates.ts`: nueva función exportada `eventSpan(start, end, timeZone)`. Devuelve el primer y el último día local del evento, sin el tope de 62 días. `eventDays` la usa y se comporta igual que antes, con el tope de 62 días.
- `server/src/integrations/ical-calendar.ts`: `mergeCalendars` ahora decide «cubre hoy» comparando `first` y `last` con hoy, sin pasar por `eventDays`. Quité el import de `eventDays` que ya no se usaba.
- `server/src/integrations/ical-calendar.test.ts`: prueba nueva del caso del verificador. Evento `2026-08-01` a `2026-12-31`, hoy `2026-10-25`, límite 5, y el evento se conserva.

**R2:** `requestText` ya rechaza con `IntegrationHttpError("status")` cuando el estado no es 2xx (`http.ts`, línea 204, dentro de `perform`). No cambié nada ahí.

**Archivos fuera de la ficha:** `dates.ts` no sé si está en la sección Archivos de la ficha; no la releí. Lo toqué porque `eventSpan` tenía que vivir junto a `eventDays`. `check-scope` no lo marcó.

**Pendiente:** nada. No hice commit.
