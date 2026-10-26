**Informe del programador — F-014, vuelta 2**

**Estado:** hecho. Typecheck, lint (0 errores, 83 avisos), `npm test` (493 pasan, 2 omitidas), format:check y `tools/check-scope programador --base ficha/F-014` pasan.

**Cambios** (`server/src/integrations/ical-calendar.ts` y su `.test.ts`):
- **Tope de repeticiones:** `MAX_REPETITIONS` (2 000) ahora cuenta solo las repeticiones que se añaden a los eventos, es decir, las que caen en la ventana. Una reunión diaria desde 2019 da 94 eventos y `truncated = 0`.
- **Tope de pasos:** `MAX_STEPS = 100_000` cuenta cada paso del iterador por calendario, también los de antes de la ventana. Al llegar corta y suma a `truncated`.
- **Velocidad:** con 100 000 pasos, `FREQ=MINUTELY` tardaba unos 3,6 s bajo carga, por encima del límite de 3 s. Añadí un atajo: se salta `getOccurrenceDetails` en las ocurrencias muy anteriores a la ventana. El margen es la duración del evento más 2 días. El atajo solo se aplica si la serie no tiene excepciones, porque una ocurrencia movida a la ventana se perdería. Con él, la prueba pasa dentro de los 3 s.

**Pruebas:**
- Nueva: desde 2019 diario hay 94 eventos y `truncated = 0`.
- Nueva: `MINUTELY` desde 2019 termina en menos de 3 s con `truncated > 0`.
- Modifiqué la prueba existente «caps the repetitions of a calendar». Ahora usa `FREQ=HOURLY` desde 2026-10-01. Con el criterio nuevo, el diario desde 2015 ya no llegaba al tope de 2 000 y la prueba habría fallado.

No añadí dependencias ni archivos fuera de los dos tocados. No hice commit.

