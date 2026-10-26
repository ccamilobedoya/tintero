## Informe del programador · F-013 · vuelta 1

**Estado:** hecho, con una reserva. `npm test` pasa: 457 pruebas. Pasan `typecheck`, `lint` y `format:check`, y `tools/check-scope programador --base ficha/F-013` sale limpio.

**Hecho (según los CA)**
- **Fechas y festivos (CA2 a CA4):** `eventDays` está en `dates.ts` (R2). `holidays.ts` tiene `applyCorrections`, `nextHoliday` y `holidayLabel`.
- **Configuración (CA1):** `holidays` en `ViewsConfig` con sus punteros de error. Los dos ejemplos de config están actualizados y existe `config/calendario.data.example.json`.
- **Motor (CA5):** `Engine.setHolidays`, con validación y `changed`. Las correcciones `add`/`remove` se aplican ahí. `BlockContext.holidays` es el mapa ya corregido. La clave de dibujo incluye los festivos solo en vistas con calendario, así que `hoy` se redibuja solo cuando cambian.
- **Dibujo (CA6 a CA11):** `month-calendar.ts` sigue las reglas 1 a 9. Mis pruebas de HTML dan las mismas medidas que los CA: caja de hoy 32×24 en (748,400), raya de 16×2 del 6 en (561,356), barras del viaje en x 639, 678 y 717, mes de 6 semanas, punto de 5×5 en vertical y `hidden.mes = 7` en la vista `mini`.
- **`http.ts` (CA16):** `Manifest.needsKey`, con `trilium-tareas` en `true`. Con `needsKey: false` no se lee llave ni se manda `Authorization`. Con `needsKey: true` y sin `keyFile` da `key-missing`. Hay 3 pruebas nuevas.
- **Integración `festivos` (CA12 a CA15, CA18):** `holidays-nager.ts` con manifiesto `holidaysManifest`, caché a 600 y 30 días, reintento a la hora y `404` por 24 h. La entrada opcional `festivos` en `integrations.json` y el cableado en `main.ts` (paso de apagado de 6 s) están hechos.
- **`npm run render -- --holidays` (CA19):** el archivo se lee con tope de 64 KiB. Un archivo grande, una fecha mala o un JSON inválido salen con código 2.

**Archivos fuera de la lista de la ficha**
- `view.ts`: pasa los festivos al contexto del bloque.
- `README.md` de `server/src/integrations`.
- Pruebas nuevas: `dates`/`holidays.test.ts`, `month-calendar.test.ts`, `holidays-nager.test.ts`, más casos en las pruebas existentes de config, motor, `http`, integraciones y `render`.

**Extra al contrato:** `createHolidays` acepta un `timeZone` opcional (UTC por defecto) para el «año local de hoy». `main.ts` le pasa la zona de las vistas.

**Dos decisiones mías donde la ficha no es explícita:**
- Los mensajes de R7 (`holidays: festivos integration is off`) y de `festivos: no country in views` salen como `{ ts, msg }` por `logEngine`.
- `unknown-country` se registra una sola vez por instancia, no una vez por cada 24 h.

**Aceptación (`npm run test:acceptance`):** 552 pasan y 2 fallan, ninguna de F-013.
- F-005 CA27 (tres motores con Chromium real, `busy`): falló en la corrida completa y pasa sola con `-- tests/acceptance/F-005` (79 de 79). Parece un problema de carga, no lo he confirmado.
- F-007 CA6 pide `.revisar/semgrep.json`, que se genera con `tools/revisar`. No lo corrí porque no es mi rol.

**Reserva:** no pude medir píxeles con Chromium real. Las medidas salen de la geometría del HTML (`left`, `top`, `width`, `height`), no de la imagen. Los CA de píxeles (en especial las negritas del CA7 y la etiqueta cortada del CA6) quedan para el verificador.

Sin dependencias nuevas y sin archivos temporales. No hice commit.

