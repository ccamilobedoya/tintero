## Informe del revisor · F-014 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (4)

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Lo que juzgué (todo cumple)**
- **Direcciones secretas:**
  - La dirección se parte en origen y ruta en `main.ts`, y de ahí no pasa.
  - El registro de `perform` solo lleva `host`, `method`, `status` y `ms`. Los errores llevan un código y nada más (`IntegrationHttpError`, `CalendarParseError`).
  - Los errores de `parseCalendars` llevan la posición JSON, nunca el valor.
  - `state.json` y el archivo de estado guardan solo eventos con `id`, título e ícono. Esos títulos son privados, pero el archivo se escribe en modo 600.
  - El motor recibe `calendar: id`.
  - La prueba `never logs the address or a title` cubre el caso.
- **`requestText`:** reutiliza las guardias de `request`. Ambos llaman a `perform`, así que comparten `checkPath`, el manifiesto de rutas, `redirect: "error"`, `maxBytes` (por `Content-Length` y por flujo), el tiempo de espera y el registro. Nada se copió. `request` solo añade el JSON encima.
- **Topes antes de parsear:**
  - 8 MiB por calendario, vía `ICAL_HTTP_LIMITS`.
  - `countVevents` (máximo 20 000) corre antes de `ICAL.parse`.
  - El archivo de calendarios se lee con `readCapped` a 32 KiB.
  - El `stateFile` se lee con `readCapped` a 4 MiB, y `persist` no guarda lo que pase de ese tope.
- **iCalendar hostil:**
  - `MAX_STEPS` es 100 000.
  - `MAX_REPETITIONS` es 2000.
  - Hay un atajo antes de la ventana (`skipMs`/`skipDays`).
  - Pasar `exceptions: []` evita el escaneo cuadrático de `ical.js`.
  - Cada evento y cada serie van en `try/catch`.
  - `TimezoneService.reset()` va en `finally`.
- **Modo 600:** `loadCalendars` rechaza con `key-permissions` si `mode & 0o077` no es cero. También rechaza lo que no sea un archivo normal.
- **`ical.js@2.2.1`:** licencia MPL-2.0 y sin dependencias propias. Se usa solo en `ical-calendar.ts`. La ficha lo permite. Una alternativa propia para RRULE y VTIMEZONE sería más riesgosa.

**Mejoras** (se anotan en la ficha)
- `ical-calendar.ts:126`: `ICAL.parse` y la expansión son síncronos. Con 8 MiB y 100 000 pasos pueden bloquear el bucle de eventos unos segundos mientras sirve imágenes. La prueba de rendimiento lo acota a menos de 3 s para 20 000 eventos simples, pero no para el peor caso de excepciones. Se podría ceder el turno entre calendarios, o medir el peor caso y anotarlo.
- `config.ts` (`loadCalendars`): el modo se comprueba en un `open` y el contenido se lee en otro (`readCapped`). Es una ventana mínima de carrera, la misma que ya tiene `readKey`. Se podría leer del mismo descriptor en las dos.
- `httpsUrl` rechaza direcciones con `?query` porque `parseBase` no las admite. Algunos proveedores ponen el token en la query, y esos fallarían con un error genérico. Conviene dejarlo escrito en `config/README.md` (no hay cambio de código).
- La licencia MPL-2.0 es copyleft de archivo y no obliga mientras no se modifique `ical.js`. Conviene anotarlo en el ADR o la ficha. El manifiesto con `hosts: "configured"` acepta cualquier host HTTPS del archivo 600, incluidas IP privadas. Es una decisión de la ficha (ADR-0054), solo queda registrada.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- Ninguna nueva. Los avisos de eslint en `tests/acceptance/F-00x` son los conocidos.

**No medido:** las pruebas de render no corrieron (no hay navegador). Este cambio no toca la web, así que no aplica.
