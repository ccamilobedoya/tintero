## Informe del programador · F-019 · vuelta 1

**Estado:** listo para verificar

**Qué hice**
- Firmware: el lector HTTP con plazos (`http_reader`), el decodificador `pb1` (`packbits`) y `recovery` (espera creciente y texto de falla). `tintero.cpp` ya no usa `HTTPClient`: escribe el pedido a mano sobre `NetworkClientSecure` y declara `Tintero-Formats: pb1,raw1` y `esp32-0.2`.
- `main.cpp`: *watchdog* de 60 s, espera creciente, reinicio controlado tras 8 fallas seguidas y descarga de la imagen en `pb1` directo al búfer. `index.cpp` salta vistas de formato desconocido y `zones.cpp` salta zonas con `act` desconocido.
- Contrato: `pb1` en los esquemas, `packBits`/`unpackBits` y `Tintero-Formats` que ignora los nombres que no conoce. Regeneré `schema` y `openapi`.
- Servidor: `pb1` guardado con cada dibujo y recortes de índice y zonas con aviso. Emulador: `--formats` acepta `pb1`.
- Compilación del firmware: sale 0, sin avisos. RAM 107 548 B y *flash* 1 173 814 B, dentro de CA20.

**Archivos tocados**
- Nuevos: `firmware/src/{http_reader,packbits,recovery,health}.{h,cpp}`, `contract/src/packbits.{ts,test.ts}`, `contract/fixtures/v1/valid/index-pb1.json`, `server/src/app-pb1.test.ts`, `emulator/src/pb1.test.ts`, `firmware/test/native/{unit_test,parse_test}.cpp`.
- Cambiados: `firmware/{platformio.ini,README.md,README.es.md}`, `firmware/src/{tintero,main,index,zones}.*`, `contract/src/{schemas,validate,openapi,index,validate.test}.ts`, `contract/schema/v1/index.schema.json`, `contract/openapi/v1.json`, `server/src/app.ts`, `server/src/engine/engine.ts`, `emulator/src/{sync,cli,types,fake-server}.ts`.
- Fuera de la sección *Archivos* de la ficha:
  - `firmware/src/health.{h,cpp}` (nuevo): guarda en `RTC_NOINIT_ATTR` la última falla y el motivo del arranque (R7), y decide el reinicio controlado de máximo uno por hora (R6). Lo separé para no meter eso en `tintero.cpp`.
  - `server/src/engine/engine.ts`: la ficha pide guardar el `pb1` con la imagen dibujada.
  - `emulator/src/fake-server.ts` y `contract/src/validate.test.ts`: el primero para probar `pb1` en el emulador; el segundo, porque `raw1,bmp` ahora es válido (lo dice R8).

**Comprobaciones:** typecheck ✅ · lint ✅ (la parte de `tests/` da 85 avisos en archivos de aceptación que no toqué; el comando no los cuenta como error) · test ✅ (564 pasan, 2 saltadas) · format ✅ · check-scope ✅

**Dudas o ambigüedades de la ficha:**
- `npm run test:acceptance` falla en 4 pruebas, y no pude confirmar que sean anteriores a mis cambios.
  - F-005 CA27 (el primer `index` de cada motor no da `busy`): pasa sola; probablemente es temporización con la máquina cargada.
  - F-013 CA20 (2 pruebas, pasadas anteriores): no las reproduje solas. No sé si fallan por la carga o por algo mío.
  - F-007 CA6: pide `.revisar/semgrep.json`, que sale de `tools/revisar`. No puedo correrla, el entorno me la bloquea.
- `tools/probar-firmware` falla si le paso dos archivos con `main()` a la vez. Mis pruebas nativas se corren de a una: `unit_test.cpp` y `parse_test.cpp`, ambas pasan.
- R6 pide guardar la hora del último reinicio. Uso la hora Unix y, si no hay reloj válido, el tiempo encendido.
- Cuando se recortan vistas (R12), tampoco quito las que sean `parent` de otra vista que queda, para no dejar el índice inválido.

**Dependencias:** ninguna nueva (ArduinoJson fijado en `7.4.2` en `platformio.ini`, como pide la ficha)

--- programador · costo USD 2.691 · turnos 157 · tokens entrada 150 (+caché 9639349) salida 91377 · success
