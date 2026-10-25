# F-013 · Calendario del mes con festivos y días con eventos

**Estado:** borrador. Decisiones D1 a D7 **sin aprobar**. Rama aparte `ficha/F-013`, que **no entra a `main` hasta que F-008 esté cerrada** (ver D7)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** depende de D6. Propuesta: `ical.js` (MPL-2.0, sin dependencias propias) para leer calendarios iCalendar con repeticiones. Sin aprobar.

## Decisiones que pide esta ficha (puerta 1)

| # | Decisión | Propuesta (sin aprobar) | Otras opciones |
|---|----------|-------------------------|----------------|
| **D1** | Cómo se marca un festivo | **F2 · Como domingo:** el número va en negrita, igual que los domingos (la convención del calendario impreso, donde los festivos van del color de los domingos). Si hoy es festivo, el número sigue invertido y en negrita | F1 · negrita solo en festivos; F3 · marco de 2 px |
| **D2** | Cómo se marca un día con eventos | **E1 · Raya de 2 px** debajo del número (la de hoy, pero de 1 px pasa a 2 px por ADR-0049). Si la fila no tiene alto suficiente, ver «Reglas de espacio» | E2 · puntos de 5 px, uno por evento hasta 3 |
| **D3** | Próximo festivo | **P2 · Junto al título del mes**, a la derecha, en letra de detalle: `FESTIVO LUN 2 NOV`, o `HOY FESTIVO`. No le quita alto a la cuadrícula | P1 · nada; P3 · pie con el nombre (le quita 24 px a la cuadrícula: las filas bajan de 35 a 30 px) |
| **D4** | De dónde salen los festivos | **H3 · Nager.Date** (API libre, sin llave, 204 países), **una consulta por país y año**, guardada en el `stateFile`; con la red caída se usa lo guardado | H1 · reglas propias por país en el repo; H2 · librería `date-holidays`; H4 · calendario público de festivos en iCalendar |
| **D5** | Dónde se dice el país | Bloque `holidays` en la configuración de vistas, junto a `timezone`: `country` (ISO 3166-1, dos letras) y correcciones `add` / `remove` | Por pantalla (cada aparato con su país), si más adelante hace falta |
| **D6** | De dónde salen los eventos | **Ev1 · Dirección secreta iCalendar** de cada calendario (Google, iCloud, Outlook y Nextcloud la dan): solo lectura, sin OAuth y sin vencimiento. Varias direcciones se juntan en una sola fuente | Ev2 · API de Google Calendar con OAuth (pendiente desde el diseño; atada a Google); Ev3 · CalDAV |
| **D7** | Alcance y orden | **Una ficha en dos partes:** A (marcas y festivos, ninguna lectura nueva salvo la de festivos) y B (integración iCalendar). Se programan en ese orden, sobre `main` **después de cerrar F-008** | Partirla en dos fichas (F-013 y F-014) |

### Por qué estas propuestas
- **D1, F2.** En 1 bit la negrita hace el papel del rojo. Sin marcos alrededor de los números, porque esa forma ya se usa para el foco (anillo punteado) y para «Enviando» (anillo sólido) (ADR-0048), y el calendario no tiene foco. F3 es la marca que más se ve, pero choca con la raya de evento (quedan dos líneas pegadas) y, en meses de 6 semanas, el marco blanco de «hoy festivo» tapa el número (diseño 3). F1 deja el festivo solo, pero un lunes en negrita se lee peor si no hay domingos en negrita al lado.
- **D2, E1.** A 124 ppp la raya de 2 × 16 px se ve mejor que un punto de 5 px (≈1 mm). E2 dice cuántos eventos hay, pero a esa distancia tres puntos se juntan en una mancha. La raya actual de 1 px queda por debajo del mínimo de ADR-0049.
- **D3, P2.** El nombre del festivo no cabe junto al título (284 px de ancho con `SEPTIEMBRE 2026`) y el pie aprieta las filas hasta donde la raya ya no cabe con aire. La fecha sí cabe en todos los meses.
- **D4, H3.** Los festivos **cambian por ley**: la Ley 2578 de 2026 de Colombia agregó uno nuevo (9 de julio, que se corre al lunes 13 en 2026). Nager.Date ya lo tiene y la mayoría de listas publicadas en 2025 no. Con reglas propias (H1) cada cambio de ley pide una ficha; H2 suma 11 MB y 12 dependencias (entre ellas `moment-timezone`), con datos bajo CC-BY-3.0; H4 mezcla fechas que no son de descanso. Las correcciones `add` / `remove` (D5) cubren el tiempo que tarde la fuente en ponerse al día.
- **D6, Ev1.** Es lo más genérico (no ata a una plataforma, como pide el diseño), no vence y no necesita una app de Google en producción. La dirección es un **secreto** (quien la tenga lee el calendario): se trata como el token del ETAPI (archivo 600, nunca en registros).

## Diseños

PNG de 1 bit dibujados con una **copia del motor** (`main` de hoy, antes de F-008) a la que se le agregaron las marcas. Panel 800 × 480, 124 ppp, ejemplos de F-006 con eventos de prueba. Ampliados ×2 sin suavizado. **Manda el contrato** de esta ficha, y la geometría final se mide sobre F-008.

**Hoy:** los días con eventos llevan una raya de 1 px y no hay festivos.

![actual](../disenos/F-013/0-actual.png)

**D1 · Festivo** (octubre de 2026, el 12 es festivo):

![opciones de festivo](../disenos/F-013/1-festivo.png)

**D2 · Evento** (el 14 y el 27 tienen dos eventos). La esquina se probó y se descarta: no se ve.

![opciones de evento](../disenos/F-013/2-evento.png)

**Casos de borde:** hoy es festivo y tiene evento; mes de 6 semanas (noviembre y agosto de 2026), donde la caja del número se achica para que la raya quepa debajo; el marco de F3 tapando el número.

![casos de borde](../disenos/F-013/3-bordes.png)

**D3 · Próximo festivo:** junto al mes (P2) y pie con nombre (P3, las filas bajan a 30 px).

![próximo festivo](../disenos/F-013/4-proximo.png)

**Pantalla completa** con la propuesta (F2 + E1 + P2):

![hoy con la propuesta](../disenos/F-013/5-hoy-propuesta.png)

**Vista vertical** (celdas de 68 × 25 px): la raya no cabe, así que la marca pasa a un punto a la derecha del número.

![vertical](../disenos/F-013/6-vertical.png)

## Contexto
El bloque `month-calendar` (F-005) ya muestra el mes con hoy invertido y subraya los días donde **empieza** un evento, pero la vista `hoy` de los ejemplos tiene la fuente `calendario` vacía y no hay ninguna integración que traiga eventos. El dueño pidió marcar los **festivos del país**, configurable para que sirva en cualquier país cuando el proyecto sea público, y los **días con eventos de su calendario**. Aplican ADR-0009 y 0040 a 0045 (integraciones), ADR-0032 (cada bloque es dueño de su diseño), ADR-0035 (dibujar cuando hay información nueva), ADR-0048 y 0049 (foco y grosores).

## Alcance
**Parte A · Marcas y festivos**
- Marcas de festivo, evento y próximo festivo en `month-calendar` según D1 a D3, con las reglas de espacio de abajo.
- Un evento marca **todos los días que cubre** dentro del mes, no solo el primero. Hoy solo se marca el día en que empieza: un viaje del 29 al 31 marca solo el 29.
- Festivos por país (D4, D5) con caché por año y correcciones locales.

**Parte B · Eventos de calendarios iCalendar** (D6)
- Integración `ical-calendario`: lee una o varias direcciones secretas, expande repeticiones dentro de una ventana y entrega `events` a una fuente (alimenta también el bloque `agenda`).

**Fuera de alcance:** cambiar la letra o los tamaños del tema; el foco dentro del calendario; festivos regionales (`region`); el nombre del festivo en la pantalla (no cabe; ver D3); escribir en el calendario; OAuth de Google; mostrar la cantidad de eventos (salvo que se elija E2).

## Reglas de espacio (las mide el motor, no se dejan a ojo)
Nombres: `texto` = tamaño de la letra de texto en px (16 a 124 ppp); `caja` = alto de la caja del número; `marca` = 2 px (raya) o 5 px (punto); `separación` = 2 px; `aire` = 3 px como mínimo entre una marca y la caja de la fila siguiente.
1. `caja` = `round(1,5 × texto)` (24 px), y se achica hasta `texto + 4` (20 px) si hace falta para que `caja + separación + marca + aire` quepa en la fila. La letra no cambia.
2. Si aun así no cabe, la marca pasa **a la derecha** del número, como punto de 5 px a 2 px de la caja, **solo si** la columna mide al menos `2 × texto + 2 + 5 + 6` px. Así el punto queda dentro de su propia celda (en celdas angostas quedaba entre dos números, «10 ■ 11»).
3. Si tampoco cabe al lado, se muestran los festivos y no la marca de evento, y el bloque informa `hidden` igual al número de días con eventos que no llevan marca.
4. La etiqueta del próximo festivo (P2) va solo si cabe entera a la derecha del título con 8 px de separación. Si no, no se dibuja y el título no se corta.

Medido en las maquetas: horizontal, mes de 5 semanas → filas de 35 px (regla 1 sin achicar); 6 semanas → filas de 29 px (regla 1 con `caja` de 20 px); vertical → filas de 25 px y columnas de 68 px (regla 2).

## Requisitos
- **R1.** Festivos: un día es festivo si está en la lista del país y año, más `add`, menos `remove`. Sin `holidays` en la configuración, no hay festivos ni avisos.
- **R2.** Las marcas de D1 a D3 siguen las reglas de espacio. Los trazos miden al menos 2 px (ADR-0049).
- **R3.** Días de un evento: un evento de día completo cubre de `start` a `end − 1 día` (en iCalendar el fin es exclusivo). Uno con hora cubre cada día local, en la zona de la configuración, que toca entre `start` y `end`. Sin `end`, solo el día de `start`. Como máximo 62 días por evento.
- **R4.** Festivos (H3): una consulta por `(país, año)`, para el año de hoy y el siguiente desde el 1 de diciembre; se guarda en el `stateFile` con la fecha de lectura; se vuelve a pedir a los 30 días o cuando falta; con error se queda lo guardado y se reintenta en 1 h. Nunca bloquea el dibujo: sin datos, el mes se dibuja sin festivos.
- **R5.** iCalendar (Parte B): cada dirección se lee cada 15 min (`pollS: 900`); se expanden repeticiones (`RRULE`, `RDATE`, `EXDATE`, excepciones con `RECURRENCE-ID`) solo dentro de la ventana `[primer día del mes actual − 7 días, hoy + 62 días]`; con error se mantiene lo último bueno y se marca `sin datos desde` (ADR-0041).
- **R6.** Lo nuevo se dibuja cuando cambian los datos (ADR-0035). Al cambiar de día, el calendario se redibuja aunque no cambien los datos.

## Contrato
*(Borrador, se ajusta con lo que apruebe el dueño.)*

**Configuración de vistas** (`ViewsConfig`, campo nuevo opcional al nivel de `timezone`):
```json
"holidays": {
  "country": "CO",
  "add": [{ "date": "2026-12-24", "name": "Nochebuena" }],
  "remove": ["2026-01-12"]
}
```
- `country`: `^[A-Z]{2}$`. `add`: hasta 50, `date` válida (`validDate`), `name` de 1 a 60 caracteres. `remove`: hasta 50 fechas válidas. Errores de `ConfigError` con puntero, p. ej. `/holidays/country`.

**Motor (Parte A)**
- `server/src/engine/holidays.ts`:
  - `interface Holiday { date: string; name: string }` (`date` = `YYYY-MM-DD`).
  - `applyCorrections(list: Holiday[], add: Holiday[], remove: string[]): Holiday[]`, ordenada por fecha y sin fechas repetidas (si `add` repite una fecha, gana el nombre de `add`).
  - `nextHoliday(list: Holiday[], today: DayParts, withinDays = 366): Holiday | undefined` (incluye hoy).
  - `holidayLabel(list: Holiday[], today: DayParts): string | undefined` → `HOY FESTIVO`, `FESTIVO LUN 2 NOV` (con `upperDate`) o `undefined`.
- `server/src/engine/dates.ts`: `eventDays(start: string, end: string | undefined, timeZone: string): DayParts[]` (R3, tope 62).
- `BlockContext` gana `holidays: ReadonlyMap<string, string>` (clave `dayKey`, valor nombre) con los festivos ya corregidos. Los bloques no saben de dónde salen (ADR-0009).

**Fuente de festivos (Parte A, H3)**
- `server/src/integrations/holidays-nager.ts`, manifiesto: `id: "festivos"`, `delivers: "holidays"` (valor nuevo), `hosts: ["date.nager.at"]`, `routes: [{ method: "GET", prefix: "/api/v3/PublicHolidays/" }]`, `writes: false`, `pollS: 86400`.
- Respuesta limitada a **64 KiB antes de parsear**; se toman `date` y `localName` (este último recortado a 60 caracteres); se descartan las entradas con `global: false` (regionales) y los tipos que no sean `Public`.
- El `stateFile` guarda `{ "CO:2026": { "readAt": "...", "items": [...] } }`.

**Integración iCalendar (Parte B, Ev1)**
- `server/src/integrations/ical-calendar.ts`, manifiesto: `id: "ical-calendario"`, `delivers: "events"`, `hosts: "configured"` (el origen de cada dirección, **solo `https:`**), `routes: [{ method: "GET", prefix: "/" }]`, `writes: false`, `pollS: 900`.
- Configuración en `integrations.json`: `{ "source": "calendario", "urlFile": "/ruta/privada/calendarios.txt", "stateFile": "..." }`. `urlFile`: permisos 600 (como `keyFile`), de 1 a 10 líneas, cada una una URL `https:` de hasta 2048 caracteres; líneas vacías y que empiezan con `#` se ignoran.
- Por dirección: respuesta de **2 MiB como máximo antes de parsear**, 5 000 componentes `VEVENT` como máximo y 2 000 eventos expandidos como máximo por lectura.
- Se entrega por evento `id` (UID + fecha de la repetición, con hash), `title` (`SUMMARY`, recortado a 120), `start`, `end`. `location` y `notes` no se copian (no se usan y son datos personales).
- **Nunca** se escribe la dirección, una parte de ella ni el título de un evento en registros o errores: se identifica cada dirección por su número de línea (`calendario 2`).

## Criterios de aceptación
Los valores en píxeles de CA5 a CA9 **se escriben al cerrar F-008**, porque F-008 cambia el margen de todo lo que no es zona (`focusPad`). Hasta entonces, esos CA dicen qué se mide pero no el valor exacto.

**Parte A**
- **CA1.** `applyCorrections` con la lista de Nager.Date de `CO` 2026 grabada (19 festivos, con el 13 de julio), `add` = `[{2026-12-24, "Nochebuena"}]` y `remove` = `["2026-01-12"]` → 19 festivos, ordenados, sin el 12 de enero y con el 24 de diciembre.
- **CA2.** Configuración: `country: "co"` → `ConfigError` en `/holidays/country`; `add` con `2026-02-30` → error en `/holidays/add/0/date`; 51 elementos en `remove` → error en `/holidays/remove`.
- **CA3.** `holidayLabel` con hoy `2026-10-25` → `FESTIVO LUN 2 NOV`; con hoy `2026-11-02` → `HOY FESTIVO`; con una lista vacía → `undefined`.
- **CA4.** `eventDays`: `2026-10-29` a `2026-11-01` (día completo) → 29, 30 y 31 de octubre; `2026-10-30T22:00:00-05:00` a `2026-10-31T02:00:00-05:00` en `America/Lima` → 30 y 31; uno de 100 días → 62 días.
- **CA5.** Vista `hoy`, reloj `2026-10-25T20:00:00Z`, ejemplos de F-006 con `config/calendario.data.example.json` (eventos sintéticos, archivo nuevo) y festivos grabados de `CO`: el 12 y los domingos se dibujan en negrita (se comprueba por píxeles en una franja del número), el 25 invertido y en negrita, raya de 2 px bajo los días con eventos, y `FESTIVO LUN 2 NOV` alineado a la derecha en la fila del título. *(Píxeles: al cerrar F-008.)*
- **CA6.** Mismo caso con el reloj `2026-11-02T13:00:00Z` (6 semanas): `caja` de 20 px y raya debajo, con al menos 3 px blancos hasta la caja de la fila siguiente; `HOY FESTIVO`.
- **CA7.** Panel vertical 480 × 800, reloj `2026-11-02T13:00:00Z`: marca de evento como punto de 5 × 5 px a la derecha, dentro de la celda.
- **CA8.** Un viaje del 29 al 31 de octubre (día completo, `end` 2026-11-01) marca los 3 días.
- **CA9.** Sin `holidays` en la configuración, la imagen de `hoy` es idéntica, píxel a píxel, a la de un motor sin festivos con las mismas marcas de evento.
- **CA10.** Fuente de festivos con un servidor falso local (respuesta grabada): primera lectura guarda en el `stateFile`; servidor caído y `stateFile` presente → festivos desde lo guardado; respuesta de 65 KiB → error `too_large` sin parsear, se queda lo guardado; una entrada con `global: false` no aparece.

**Parte B**
- **CA11.** Archivo `.ics` grabado con un evento semanal (`RRULE:FREQ=WEEKLY;COUNT=10`), un `EXDATE` y una excepción con `RECURRENCE-ID`: dentro de la ventana salen exactamente las repeticiones esperadas (lista en la prueba), con la excepción en su hora nueva.
- **CA12.** Dos direcciones en `urlFile` → una sola fuente `calendario` con los eventos de las dos; si la segunda falla, la primera se sigue entregando y la fuente queda con `sin datos desde`.
- **CA13.** `urlFile` con permisos 644 → la integración no arranca y el error dice el archivo, sin su contenido; una línea `http:` → error `calendario 1: solo https`.
- **CA14.** Respuesta de 2 MiB + 1 byte → error sin parsear. 5 001 `VEVENT` → error. Nada de lo que se registra contiene la dirección ni un `SUMMARY` (la prueba busca las dos cadenas en todo lo registrado).

## Presupuestos
- Festivos: como mucho 2 consultas por país al mes en marcha normal.
- iCalendar: leer y expandir un archivo de 2 MiB en menos de 1 s en el servidor (se mide en la verificación y se anota).
- Dibujo del calendario: sin cambio medible respecto a F-008 (se anota el tiempo de `hoy` antes y después).

## Seguridad
- [ ] Toda entrada externa con **límite de tamaño antes de parsear**: 64 KiB (festivos), 2 MiB (iCalendar), `urlFile` de 32 KiB como máximo.
- [ ] Servicios locales solo en **127.0.0.1** (nada nuevo escucha).
- [ ] Dependencias nuevas nombradas arriba: `ical.js` si se aprueba D6 (zona sensible, la marca la revisión).
- I-reglas: cada integración declara sus hosts; el cliente con guardia rechaza cualquier otro (CA10 y CA13 lo prueban con un host no declarado).
- La dirección iCalendar es un secreto: archivo 600 fuera del repo, nunca en registros (CA14), nunca en `state.json` ni en el `stateFile`.
- Nager.Date solo recibe el país y el año.

## Archivos
**A crear:** `server/src/engine/holidays.ts` (+ `.test.ts`), `server/src/integrations/holidays-nager.ts` (+ `.test.ts`), `server/src/integrations/ical-calendar.ts` (+ `.test.ts`), `config/calendario.data.example.json`, `tests/acceptance/F-013/` (verificador), respuestas grabadas en `tests/acceptance/F-013/fixtures/` (`nager-CO-2026.json`, `semanal.ics`).
**A tocar:** `server/src/engine/blocks/month-calendar.ts`, `server/src/engine/blocks/types.ts`, `server/src/engine/dates.ts`, `server/src/engine/config.ts`, `server/src/engine/engine.ts`, `server/src/integrations/manifest.ts`, `server/src/integrations/config.ts`, `config/tablero.views.example.json` (`holidays` de ejemplo), `config/integrations.example.json`, `docs/seguridad.md` (hosts nuevos), `package.json` y `package-lock.json` (solo si D6).

## Resultado esperado
En `hoy`, el mes muestra los festivos del país en negrita como los domingos, una raya de 2 px bajo cada día con algo en el calendario (también en los días del medio de un viaje) y, junto al título, cuándo es el próximo festivo. Cambiar `country` cambia los festivos sin tocar código. Los eventos llegan solos desde las direcciones iCalendar del dueño, y si la red se cae el calendario sigue con lo último que leyó.

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto).
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

## Listo para programar (se marca antes de pedir aprobación)
- [ ] Cada CA se puede comprobar con una prueba, con valores concretos. *(Faltan los píxeles de CA5 a CA9, después de F-008.)*
- [x] El contrato (interfaces, formatos, errores) está escrito. *(Borrador, según D1 a D7.)*
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [ ] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos. *(Falta el puerto del servidor falso de CA10 a CA14.)*
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
