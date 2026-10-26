## Informe del programador · F-017 · vuelta 1

**Estado:** listo para verificar

**Qué hice**
- `stripRow` tiene la opción `plainRight` (peso 400 y espaciado 0 en el texto de la derecha). El título propio del mes la usa.
- Nueva opción `--next-wake-usb-s` (30–86 400, 600 por defecto) y `ServerConfig.nextWakeUsbS`. El índice responde 600 con `Tintero-Power: usb` y 1800 con `battery`, con motor y en el modo demostración. Sin `nextWakeUsbS` vale `nextWakeS`.
- `Engine.index` acepta `wakeS`. El motor lo guarda por pantalla y `prewarm` lo usa; sin `wakeS` usa `EngineOptions.nextWakeS`.
- Documenté la opción en `server/README.md` y el cambio de `next_wake_s` según la alimentación en `firmware/README.md`.

**Archivos tocados**
- `server/src/engine/blocks/common.ts`, `server/src/engine/blocks/month-calendar.ts`: `plainRight` y su uso en el título del mes.
- `server/src/engine/engine.ts`: `wakeS` en `index`, guardado por pantalla y usado en `prewarm`.
- `server/src/app.ts`, `server/src/args.ts`, `server/src/main.ts`: opción nueva, texto de uso y `next_wake_s` según `Tintero-Power`.
- `server/src/server.test.ts`: la prueba «has defaults» cambia por R4, y añadí los casos de `--next-wake-usb-s`.
- `server/src/app.test.ts`, `server/src/engine/engine.test.ts`, `server/src/engine/blocks/month-calendar.test.ts`: pruebas nuevas de USD/batería, de `prewarm` con `wakeS` y del estilo de la etiqueta.
- `server/README.md`, `firmware/README.md`: documentación.
- Fuera de la sección *Archivos* de la ficha: ninguno.

**Comprobaciones:** typecheck ✅ · lint ✅ (0 errores) · test ✅ (504 pasan, 2 omitidas) · format ✅ · check-scope ✅

**Aceptación:** `npm run test:acceptance` completo falló dos veces por carga. En las dos fallaron F-005 CA27 y F-013 CA20, que la ficha nombra como inestables. Corridas solas pasan F-005 (`engine.test.ts`), F-014 (`previous.test.ts`) y F-013 (`previous.test.ts`; falló una vez porque ejecuta F-005 CA27 por dentro, y pasó en la segunda corrida). También falló F-007 CA6 y no pude volver a correrlo. `tools/revisar --base main` pide aprobación en este entorno y no pude ejecutarlo, que es lo que esa prueba necesita antes. Los CA de F-017 los verificará el verificador en `tests/acceptance/F-017/`.

**Dudas o ambigüedades de la ficha:** ninguna

**Dependencias:** ninguna nueva
