# F-014 · Los calendarios del dueño en la pantalla, con un símbolo por calendario

**Estado:** aprobada · el dueño la aprobó el 2026-10-25 (D1 a D7; ADR-0053 y ADR-0054)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** `ical.js@2.2.1` exacta (MPL-2.0, sin dependencias propias, firma del registro verificada, 1,4 MB): lee iCalendar con repeticiones, excepciones y zonas horarias (ADR-0054). Se instala con `npm install --save-exact ical.js@2.2.1`.
**Rama:** sale de `ficha/F-014`, que trae `ver/F-013` (y con ella F-008). No entra a `main` antes que F-013.

## Decisiones (puerta 1)

| # | Decisión | Aprobado |
|---|----------|----------|
| **D1** ✅ | Símbolo por calendario | **Pictogramas** de 16 px a la izquierda de la hora: persona, maletín, casa, pastel, corazón y estrella (ADR-0053) |
| **D2** ✅ | iCloud (iPhone) | **Calendario público** de cada calendario (ADR-0054) |
| **D3** ✅ | Google personal | **Dirección secreta en formato iCal** (ADR-0054) |
| **D4** ✅ | Google corporativo | **Igual que D3**: el dueño confirmó que la cuenta de la empresa la ofrece (ADR-0054) |
| **D5** ✅ | Títulos de trabajo | **Completos**, como en todos los calendarios; no hay opción `Ocupado` |
| **D6** ✅ | Leer iCalendar | **`ical.js`** (ADR-0054) |
| **D7** ✅ | Festivos en la agenda | **Sí en la agenda de pantalla completa, no en el resumen de «hoy»**: opción del bloque `agenda`, `holidays: true` (ADR-0053) |

## Diseños

PNG de 1 bit del motor (geometría de F-008, marcas de F-013). Ampliados ×2 sin suavizado. **Manda el contrato**: los píxeles de los CA salen de una implementación de referencia de estas reglas.

![tres familias de símbolos](../disenos/F-014/1-simbolos.png)

**Vista `agenda` de pantalla completa con pictogramas** (la elegida):

![agenda con pictogramas](../disenos/F-014/2-agenda-pictogramas.png)

## Contexto
F-013 dejó el mes con festivos y una raya en cada día con eventos, pero la fuente `calendario` no tiene de dónde llenarse. El dueño usa calendarios de iCloud, uno personal de Google y uno corporativo de Google, y quiere verlos todos, cada uno con su símbolo. Aplican ADR-0009, ADR-0023 (nada privado en el repo), ADR-0040 a ADR-0045 (integraciones), ADR-0048 y ADR-0049 (foco y trazos), ADR-0051 a ADR-0054.

## Alcance
- `CalendarEvent` gana `icon` y `calendar` (opcionales).
- Bloque `agenda`: columna de pictogramas y opción `holidays`.
- Cliente con guardia: lectura de **texto** (`requestText`).
- Integración `ical-calendario`: de 1 a 10 calendarios, leídos cada 4 min, expandidos dentro de una ventana y juntados en una fuente.
- Ejemplos: `config/agenda.views.example.json`, `config/agenda.data.example.json`, `config/calendarios.example.json` y la entrada nueva en `config/integrations.example.json`.

**Fuera de alcance:** escribir en los calendarios; invitaciones y asistentes; ubicación y notas (no se copian); OAuth; avisos; elegir calendarios desde la pantalla; mostrar festivos en el resumen de «hoy».

## Reglas del dibujo (bloque `agenda`)
Se conservan las de F-008 (filas de `row` px, banda `focusPad`, zonas). `texto` = tamaño en px de la letra de texto (16 a 124 ppp); `ih = row − 2 × focusPad`.
1. **Columna de pictogramas:** si al menos una fila **dibujada** (no las de «+N más») tiene pictograma, la cuadrícula del bloque gana una primera columna de `texto + 6` px; si ninguna lo tiene, el bloque se dibuja **exactamente como antes**.
2. **Pictograma:** un `<svg>` de `texto` × `texto` px con `viewBox="0 0 16 16"`, `shape-rendering="crispEdges"` y relleno negro, pegado a la izquierda de su columna y en `y = arriba de la fila + focusPad + floor((ih − texto) / 2)`. Una fila sin pictograma deja la celda vacía.
3. **Dibujos** (contenido del `<svg>`, tal cual):
   - `persona`: `<circle cx="8" cy="4" r="3.5"/><path d="M1 16V13C1 10 4 9 8 9S15 10 15 13V16Z"/>`
   - `maletin`: `<path d="M5 1H11V5H9V3H7V5H5Z"/><rect x="0" y="5" width="16" height="10"/>`
   - `casa`: `<polygon points="8,0 16,7.5 13.5,7.5 13.5,16 9.5,16 9.5,11 6.5,11 6.5,16 2.5,16 2.5,7.5 0,7.5"/>`
   - `pastel`: `<rect x="1" y="9" width="14" height="7"/><rect x="7" y="4" width="2" height="5"/><polygon points="8,0 9.6,2.2 8,3.6 6.4,2.2"/>`
   - `corazon`: `<path d="M8 15L1.5 8.5C-0.5 6.5 0.5 1.5 4.3 1.5C6 1.5 7.3 2.6 8 4C8.7 2.6 10 1.5 11.7 1.5C15.5 1.5 16.5 6.5 14.5 8.5Z"/>`
   - `estrella`: `<polygon points="8,0 10,5.6 16,5.8 11.3,9.5 13,15.5 8,12 3,15.5 4.7,9.5 0,5.8 6,5.6"/>`
4. **Festivos** (`options.holidays: true`): cada día de la ventana de la agenda que esté en `context.holidays` gana una fila de día completo con el nombre del festivo y la `estrella`, **primera** de su día. Esa fila **no es zona** (no lleva foco ni detalle) y cuenta para «+N más» como cualquier otra. Con `holidays` en `false` o sin la opción, no hay filas de festivo.

## Requisitos
- **R1.** `icon` ∈ {`persona`, `maletin`, `casa`, `pastel`, `corazon`, `estrella`}; `calendar` cumple `^[a-z0-9-]{1,32}$`. Los dos son opcionales en los datos y en `setSource`; un valor fuera de eso es error con puntero (`/…/icon`).
- **R2.** `requestText(path)` hace un `GET` con las mismas guardias que `request` (ruta del manifiesto, host, tiempo, `maxBytes`, `redirect: "error"`, registro sin contenido ni ruta) y devuelve el texto sin parsearlo. *(Aclarado el 2026-10-25.)* Un estado que no sea 2xx **rechaza** con `IntegrationHttpError("status")`, igual que `request`.
- **R3.** Cada calendario se lee cada **240 s** (`pollS: 240`; así el aviso «sin datos desde», que sale a los 5 min, solo aparece si algo falla). Cada lectura: tope de **8 MiB** antes de parsear, como máximo **20 000** líneas `BEGIN:VEVENT` (se cuentan **antes** de pasar el texto a `ical.js`) y **2 000** repeticiones **dentro de la ventana** por calendario. *(Aclarado el 2026-10-25.)* Las repeticiones anteriores a la ventana **no** cuentan para las 2 000: una reunión diaria que empezó hace años tiene que salir esta semana. Para que un evento que se repite muy seguido no deje el servidor pegado, hay además un tope de **100 000 pasos** del iterador por calendario (contando también los de antes de la ventana); si se llega, se corta y se registra `truncated`.
- **R4.** **Ventana:** desde el primer día del mes local de hoy menos 7 días hasta hoy + 62 días (inclusive). Entra todo evento o repetición que **se cruce** con ella.
- **R5.** **Conversión:** día completo → `start` y `end` como `YYYY-MM-DD` (fin exclusivo, como en iCalendar; sin `DTEND`, sin `end`); con hora → instante UTC `YYYY-MM-DDTHH:MM:SSZ`. `title` = `SUMMARY` con los espacios juntados, recortado a 200 caracteres; vacío → `(sin título)`. Se descartan `STATUS:CANCELLED` (también en una excepción). `id` = `<calendar>-` + los primeros 12 caracteres hex de `sha256(UID + "|" + start)`. `icon` y `calendar` salen del archivo de calendarios. Ubicación, notas, asistentes y alarmas no se copian.
- **R6.** **Junta:** todos los calendarios en una sola fuente, ordenados por `start`. Si pasan de **500** (el tope de una fuente), se quedan los 500 más cercanos a hoy (distancia en días entre el día de inicio y hoy; los que cubren hoy, distancia 0; empate por `start`). *(Aclarado el 2026-10-25.)* «Cubre hoy» se decide comparando `start` y `end` con hoy, **sin** el tope de 62 días de `eventDays`: un evento del `2026-08-01` al `2026-12-31` cubre el `2026-10-25`, y se registra `truncated` con la cantidad que sobró.
- **R7.** **Fallas:** si un calendario falla (red, estado distinto de 200, tamaño, demasiados eventos, iCalendar que no se puede leer), se queda su última lectura buena y los demás siguen. `readAt` de la fuente = la **más vieja** de las últimas lecturas buenas, así el motor avisa «sin datos desde» cuando cualquiera se atrasa.
- **R8.** **Estado:** con `stateFile`, la última lectura buena de cada calendario se guarda (600, escritura atómica, tope de 4 MiB al cargar) y al arrancar se entrega antes de la primera lectura. Un archivo dañado, o con calendarios que ya no están en el archivo de calendarios, se ignora en esa parte (como en ADR-0044). Guarda títulos: es privado.
- **R9.** **Secretos:** la dirección de un calendario nunca aparece en registros, errores, `state.json`, el archivo de estado ni el motor. A cada calendario se le nombra por su `id`.

## Contrato

**Datos:** `CalendarEvent` gana `icon?: Icon` y `calendar?: string`, con `export type Icon = "persona" | "maletin" | "casa" | "pastel" | "corazon" | "estrella"` y `export const ICONS: readonly Icon[]` en `server/src/engine/config.ts`.

**Vistas:** `agenda` acepta `options.holidays` (booleano). Los pictogramas viven en `server/src/engine/blocks/pictograms.ts`: `export const PICTOGRAMS: Record<Icon, string>` (el contenido de la regla 3) y `export function pictogram(icon: Icon, px: number): Raw`.

**Cliente con guardia** (`server/src/integrations/http.ts`, zona sensible): `GuardedHttp` gana `requestText(path: string): Promise<{ status: number; text: string }>`.

**Integración `ical-calendario`** (`server/src/integrations/ical-calendar.ts`)
- Manifiesto: `{ id: "ical-calendario", version: "1", delivers: "events", needsKey: false, hosts: "configured", routes: [{ method: "GET", prefix: "/" }], writes: false, pollS: 240 }`.
- `integrations.json`: `"ical-calendario": { "source": "calendario", "calendarsFile": "/ruta/privada/calendarios.json", "stateFile": "/ruta/privada/calendarios.estado.json" }`. `source` de 1 a 64 caracteres y declarada en los datos como `events`; `calendarsFile` absoluto y obligatorio; `stateFile` absoluto y opcional.
- **Archivo de calendarios** (fuera del repo): permisos 600 (si no, `IntegrationHttpError("key-permissions")`, igual que una llave), 32 KiB como máximo, un arreglo de 1 a 10 objetos `{ id, icon, url }` sin otros campos. `id` con `^[a-z0-9-]{1,32}$` y sin repetir. `icon` de la lista. `url` de 1 a 2048 caracteres: `webcal://` se cambia por `https://`; después debe pasar `parseBase` (solo `https:`, sin usuario, sin `?` ni `#`). Errores con `ConfigError` y puntero **por posición**, nunca con el valor: `calendars: /1/url: must be https:// or webcal://`.
- Por calendario: un cliente `guardedHttp(new URL(origen), undefined, manifiesto, { maxBytes: 8_388_608, timeoutMs: 15_000 })` y `requestText(pathname)`.
- `export function parseCalendar(text: string, calendar: { id: string; icon: Icon }, window: { from: DayParts; to: DayParts }, timeZone: string): { events: CalendarEvent[]; truncated: number }`: hace R3 (conteo de `VEVENT`), R4 y R5; lanza `CalendarParseError` con `code` `"too-many"` o `"bad-ical"`.
- `export function mergeCalendars(lists: CalendarEvent[][], today: DayParts, timeZone: string, limit = 500): { events: CalendarEvent[]; dropped: number }` (R6).
- `export function createIcalCalendars(options: { calendars: { id: string; icon: Icon; http: GuardedHttp; path: string }[]; source: string; engine: Pick<Engine, "setSource">; timeZone: string; stateFile?: string; clock?: () => Date; log?: Log }): { start(): void; cycle(): Promise<void>; idle(): Promise<void>; stop(): Promise<void> }`.
- Registros: `{ integration: "ical-calendario", calendar: "<id>", event: "read" | "error" | "truncated" | "state", code?, items? }`.
- `server/src/main.ts`: carga el archivo de calendarios antes de arrancar Chromium (los errores salen con código 2), crea la integración y la detiene en el apagado (6 s).

**Ejemplos**
- `config/calendarios.example.json`: `[{ "id": "casa", "icon": "casa", "url": "webcal://calendario.example/publico/casa.ics" }, { "id": "personal", "icon": "persona", "url": "https://calendario.example/secreto/personal.ics" }, { "id": "trabajo", "icon": "maletin", "url": "https://calendario.example/secreto/trabajo.ics" }]`.
- `config/agenda.views.example.json`: `version 1`, `timezone "America/Lima"`, `theme "base"`, `holidays { "country": "CO" }`, `devices { "*": { "views": ["agenda"] } }` y una vista `agenda` (título `Agenda`) con `grid.columns [62, 38]`, `rows [100]`, `areas [["eventos", "mes"]]`; `eventos` = `agenda` de `calendario`, título `Próximos eventos`, `options { "days": 7, "holidays": true }`; `mes` = `month-calendar` de `calendario`.
- `config/agenda.data.example.json`: solo la fuente `calendario` (`events`) con:

| id | title | start | icon |
|----|-------|-------|------|
| `a1` | Daily del equipo | `2026-10-26T09:00:00-05:00` | maletin |
| `a2` | Gimnasio | `2026-10-26T18:30:00-05:00` | persona |
| `a3` | Técnico de la nevera | `2026-10-27T10:00:00-05:00` | casa |
| `a4` | Revisión del sprint | `2026-10-27T15:00:00-05:00` | maletin |
| `a5` | Cumpleaños de la abuela | `2026-10-28` | pastel |
| `a6` | Comité de arquitectura | `2026-10-28T11:00:00-05:00` | maletin |
| `a7` | Clase de cerámica | `2026-10-28T18:30:00-05:00` | persona |
| `a8` | Pagar la administración | `2026-10-29` | casa |
| `a9` | 1:1 con el líder | `2026-10-29T08:30:00-05:00` | maletin |
| `a10` | Cine | `2026-10-30T20:00:00-05:00` | persona |
| `a11` | Mercado | `2026-10-31T10:00:00-05:00` | casa |
| `a12` | Almuerzo familiar | `2026-11-02T12:30:00-05:00` | corazon |
| `a13` | Planear la semana | `2026-11-01T19:00:00-05:00` | persona |

## Datos de prueba
- **Archivo iCalendar** `tests/acceptance/F-014/fixtures/prueba.ics` (líneas con `CRLF`), tal cual:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Tintero//Prueba//ES
BEGIN:VTIMEZONE
TZID:America/Bogota
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:-0500
TZOFFSETTO:-0500
TZNAME:-05
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:semanal-1@prueba
DTSTART;TZID=America/Bogota:20261005T090000
DTEND;TZID=America/Bogota:20261005T093000
RRULE:FREQ=WEEKLY;COUNT=10
EXDATE;TZID=America/Bogota:20261019T090000
SUMMARY:Daily del equipo
END:VEVENT
BEGIN:VEVENT
UID:semanal-1@prueba
RECURRENCE-ID;TZID=America/Bogota:20261026T090000
DTSTART;TZID=America/Bogota:20261026T150000
DTEND;TZID=America/Bogota:20261026T153000
SUMMARY:Daily del equipo (movida)
END:VEVENT
BEGIN:VEVENT
UID:cumple@prueba
DTSTART;VALUE=DATE:20261028
DTEND;VALUE=DATE:20261029
RRULE:FREQ=YEARLY
SUMMARY:Cumpleaños de la abuela
END:VEVENT
BEGIN:VEVENT
UID:cancelado@prueba
DTSTART:20261027T140000Z
DTEND:20261027T150000Z
STATUS:CANCELLED
SUMMARY:Reunión cancelada
END:VEVENT
BEGIN:VEVENT
UID:viaje@prueba
DTSTART;VALUE=DATE:20261029
DTEND;VALUE=DATE:20261101
SUMMARY:Viaje
END:VEVENT
END:VCALENDAR
```
- Paneles `P124` (800 × 480) y `V124` (480 × 800), 124 ppp, 1 bit. Píxel negro = 1 en `raw1`. Festivos: los 19 de `CO` 2026 de F-013, con `setHolidays`.

## Criterios de aceptación
**Datos y lectura**
- **CA1.** `icon: "gato"` en un evento → error en `/sources/calendario/items/0/icon`; `calendar: "Mi Cal"` → error en `…/calendar`; los seis pictogramas válidos se aceptan; `setSource` con `icon` inválido → `ok: false`.
- **CA2.** `parseCalendar(prueba.ics, { id: "trabajo", icon: "maletin" }, ventana 2026-09-24 a 2026-12-26, "America/Lima")` → exactamente 11 eventos, en este orden por `start`: `2026-10-05T14:00:00Z`, `2026-10-12T14:00:00Z`, `2026-10-26T20:00:00Z` (título «Daily del equipo (movida)»), `2026-10-28` (fin `2026-10-29`), `2026-10-29` (fin `2026-11-01`), `2026-11-02T14:00:00Z`, `2026-11-09T14:00:00Z`, `2026-11-16T14:00:00Z`, `2026-11-23T14:00:00Z`, `2026-11-30T14:00:00Z`, `2026-12-07T14:00:00Z`. Sin «Reunión cancelada» ni el 19 de octubre. Los de 30 min llevan `end` 30 min después. Todos con `icon: "maletin"`, `calendar: "trabajo"` e ids `trabajo-` + 12 hex, distintos entre sí y iguales en dos lecturas del mismo archivo.
- **CA3.** Un `SUMMARY` de 300 caracteres llega con 200; uno vacío, como `(sin título)`. Un archivo con 20 001 líneas `BEGIN:VEVENT` → `CalendarParseError("too-many")` sin llamar a `ical.js` (la prueba lo comprueba con un texto que `ical.js` no podría leer después de la línea 20 001). Un evento diario sin fin con una ventana de 10 años → como máximo 2 000 repeticiones y `truncated > 0`. *(Aclarado el 2026-10-25.)* **Un evento diario a las 09:00 de Bogotá desde el `2019-01-01`, sin fin, con la ventana de CA2 → sus 94 repeticiones de la ventana (del 24 de septiembre al 26 de diciembre de 2026) y `truncated = 0`.** Un evento `FREQ=MINUTELY` desde el `2019-01-01` → se corta por los 100 000 pasos, `truncated > 0`, y `parseCalendar` termina en menos de 3 s. Texto que no es iCalendar → `bad-ical`.
- **CA4.** `mergeCalendars` con 300 eventos de un calendario y 300 de otro, hoy `2026-10-25` → 500 eventos, `dropped = 100`, y los que quedaron fuera son los más lejanos de hoy.

**Integración** (servidor falso local en un puerto libre que elige la prueba, reloj inyectado)
- **CA5.** Archivo de calendarios: 644 → `key-permissions`; 11 calendarios → error; `id` repetido → error en `/1/id`; `url: "http://…"` → `calendars: /0/url: must be https:// or webcal://`, sin la dirección en el mensaje; `webcal://` se acepta. Un campo de más → error con su puntero.
- **CA6.** Dos calendarios (`casa` y `trabajo`) servidos por el servidor falso en rutas distintas: el primer `cycle()` hace dos `GET` y llama `setSource("calendario", …)` con los eventos de los dos, ordenados, cada uno con su `icon`. Si el de `trabajo` responde 500 en el siguiente `cycle()`, la fuente sigue con los eventos de los dos (la última lectura buena de `trabajo`), `readAt` es la de `trabajo` y se registra `error` con `calendar: "trabajo"`.
- **CA7.** Respuesta de 8 MiB + 1 byte → `too-large`, sin parsear. Una redirección 302 → error, sin seguirla. Ninguna línea registrada, ni el mensaje de ningún error, contiene la ruta configurada ni el `SUMMARY` de un evento (la prueba busca las dos cadenas en todo lo registrado).
- **CA8.** Con `stateFile`: tras CA6 el archivo existe con modo 600; con el servidor apagado, `start()` entrega los eventos guardados antes de cualquier `GET`. Un `stateFile` con un calendario que ya no está en el archivo de calendarios no lo entrega.
- **CA9.** `requestText`: devuelve el cuerpo tal cual (también si no es JSON); una ruta fuera del manifiesto → `route`; `PATCH` no existe en `requestText`. `request` sigue igual (las pruebas de F-009 y F-013 pasan).

**Dibujo** (motor real, `config/agenda.views.example.json` + `config/agenda.data.example.json`, `setHolidays` con los 19 de 2026, `P124`)
- **CA10 (reloj `2026-10-27T13:00:00Z`).** 8 zonas: `{8, 92, 480, 30}`, `{8, 122, …}`, `{8, 174, …}`, `{8, 204, …}`, `{8, 234, …}`, `{8, 286, …}`, `{8, 316, …}`, `{8, 368, …}`, todas de 480 × 30. Pictogramas (origen `x = 14`): **casa** en la fila de `y = 92` (origen `y = 99`): negro en `(22, 104)`, `(18, 111)` y `(26, 111)`; blanco en `(22, 111)` (puerta) y `(15, 111)`. **Maletín** en la de `y = 122` (origen 129): negro en `(22, 139)`, `(19, 132)`, `(24, 132)` y `(22, 130)`; blanco en `(22, 133)` y `(22, 129)`. **Pastel** en la de `y = 174` (origen 181): negro en `(22, 193)`, `(22, 187)` y `(22, 183)`; blanco en `(18, 187)` y `(14, 193)`. **Persona** en la de `y = 234` (origen 241): negro en `(22, 245)`, `(22, 254)` y `(16, 256)`; blanco en `(22, 249)` y `(14, 249)`.
- **CA11 (reloj `2026-11-01T13:00:00Z`, `holidays: true`).** 2 zonas: `{8, 92, 480, 30}` y `{8, 174, 480, 30}`. La fila del festivo (lunes 2, entre las dos) no es zona y lleva la **estrella** con origen `(14, 151)`: negro en `(22, 158)`, `(22, 152)` y `(17, 165)`; blanco en `(15, 152)` y `(28, 165)`. **Corazón** de `a12` con origen `(14, 181)`: negro en `(22, 189)`, `(18, 185)` y `(22, 193)`; blanco en `(22, 182)` y `(15, 195)`. El HTML del bloque contiene el nombre del festivo.
- **CA12 (mismo caso con `holidays: false`).** 2 zonas: `{8, 92, 480, 30}` y `{8, 144, 480, 30}`; negro en `(22, 159)` (corazón subió una fila); en `x 14–29, y 176–199`, todo blanco; el HTML del bloque no contiene el nombre del festivo.
- **CA13 (sin pictogramas).** `config/views.example.json` + `config/data.example.json` (F-005), sin `icon` en ningún evento: la imagen de cada vista es idéntica, píxel a píxel, a la de `ficha/F-014` (antes de esta ficha), con el mismo reloj.

**Lo que ya existe**
- **CA14.** Las pruebas de aceptación de F-005, F-006, F-008, F-009 y F-013 siguen pasando. Si F-005 CA27 falla con todo el lote, se corre sola y se informa aparte (intermitente con carga conocido, F-013).
- **CA15.** `npm ls ical.js` da `2.2.1`, `package.json` la tiene sin `^` ni `~`, y `npm audit signatures` pasa.

## Presupuestos
- `parseCalendar` con un archivo de 8 MiB (20 000 eventos simples): menos de 3 s en el servidor (se mide y se anota).
- Dibujo de `agenda`: dentro del presupuesto de F-008 (se anota).
- Red: como máximo 15 peticiones por hora y calendario.

## Seguridad
- [x] Toda entrada externa con **límite de tamaño antes de parsear**: 8 MiB por calendario y conteo de `VEVENT` antes de `ical.js`; archivo de calendarios 32 KiB; `stateFile` 4 MiB.
- [x] Servicios locales solo en **127.0.0.1** (nada nuevo escucha).
- [x] Dependencias nuevas: `ical.js@2.2.1` exacta (zona sensible; la revisa el revisor en modo juicio).
- `http.ts` es zona sensible: `requestText` reusa las guardias de `request`, no las copia.
- R9: las direcciones son secretos. El archivo de calendarios es 600 y se trata como una llave.
- `ical.js` solo recibe texto ya limitado; no se le pasa nada de la red sin el tope.

## Archivos
**A crear:** `server/src/engine/blocks/pictograms.ts` (+ `.test.ts`), `server/src/integrations/ical-calendar.ts` (+ `.test.ts`), `config/agenda.views.example.json`, `config/agenda.data.example.json`, `config/calendarios.example.json`.
**A tocar:** `server/src/engine/config.ts`, `server/src/engine/blocks/agenda.ts`, `server/src/integrations/http.ts`, `server/src/integrations/manifest.ts`, `server/src/integrations/config.ts`, `server/src/main.ts`, `config/integrations.example.json`, `package.json`, `package-lock.json`, los README de las carpetas que cambian.
**Verificador:** `tests/acceptance/F-014/` (con `fixtures/prueba.ics`).
**Arquitecto (al cerrar):** `docs/seguridad.md` (lectura de calendarios) y `docs/configuracion-local.md` (cómo crear el archivo de calendarios).

## Resultado esperado
En la agenda de pantalla completa salen los eventos de iCloud, del Google personal y del corporativo, cada uno con su pictograma, y los festivos con la estrella. En el resumen de «hoy» salen los mismos eventos sin festivos, y el mes marca cada día con algo. Si un calendario falla, los demás siguen y la pantalla avisa «sin datos desde».

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto).
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos.
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
