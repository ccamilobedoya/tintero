## Informe del verificador · F-017 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → PRUEBAS LISTAS

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `strip.test.ts`: con `hoy`, el elemento `FESTIVO LUN 2 NOV` debe tener peso 400 y espaciado 0, y `OCTUBRE 2026` peso 700 y 1px. Con el reloj en 2 nov, lo mismo para `HOY FESTIVO` y `NOVIEMBRE 2026`. Resuelve el estilo por el declarado más cercano en la cadena de elementos. Hoy falla. |
| CA2 | PRUEBA ESCRITA | `strip.test.ts`: tinta en x 651–784, filas 255–264, ninguna en y 250–254 ni 265–268, y raya negra en (600,270) y (600,271). Hoy falla. |
| CA3 | PRUEBA ESCRITA | `strip.test.ts`: la imagen de `hoy` es igual a `fixtures/hoy-main-P124.raw1` fuera de x 633–791, y 248–269. También compruebo que dentro del rectángulo sí hay cambio. El dato lo dibujé con el motor real de `main`. Hoy: la parte «igual fuera» pasa y la de «sí cambia dentro» falla. |
| CA4 | PRUEBA ESCRITA | `wake.test.ts`: valor por defecto 600 y 1800, 900, los extremos 30 y 86 400, y `UsageError` con «--next-wake-usb-s» para 29, 86401 y 10m. Hoy falla. |
| CA5 | PRUEBA ESCRITA | `wake.test.ts`: servidor real en `127.0.0.1` con puerto 0, por defecto y con `--next-wake-s 1200 --next-wake-usb-s 300`. Con `ServerConfig` por código: sin `nextWakeUsbS`, `usb` da 1800; con 600, `usb` da 600. Hoy fallan las de la opción y la de 600; la de 1800 pasa. |
| CA6 | PRUEBA ESCRITA | `wake.test.ts`: `createApp` con el motor de los ejemplos de `hoy`. `battery` da 1800, `usb` da 600 y los dos índices pasan `validateIndex`. Hoy falla. |
| CA7 | PRUEBA ESCRITA | `wake.test.ts`: con `wakeS` 600, `prewarm` no dibuja en t0+539 s y sí en t0+541 s, con «sin datos desde 08:00». Con `wakeS` 1800 o sin `wakeS`, no dibuja en t0+541 s. Las dos negativas pasan hoy; la positiva falla. |
| CA8 | PRUEBA ESCRITA | `docs.test.ts`: `server/README.md` tiene una línea con `--next-wake-usb-s` y 600. `firmware/README.md` tiene `next_wake_s` y `Tintero-Power` con usb/600 y battery/1800 en la misma línea o en las contiguas. Hoy falla. |
| CA9 | PENDIENTE | Se comprueba en la fase de verificación corriendo todo el lote, como se acordó. |

**Notas:**
- En `main`, el primer `prewarm` de un motor hace un dibujo extra de una sonda de letras (1106 caracteres, sin `data-fit=`). En CA7 cuento solo los dibujos de vista completa, o la prueba falsearía las dos negativas.
- Las pruebas usan casts locales para `nextWakeUsbS` y `wakeS`, así que compilan antes de que exista el código.
- Hoy pasan 7 de 23 pruebas; el resto falla por lo que aún no está programado.

**Pruebas:** `tests/acceptance/F-017/` (`strip.test.ts`, `wake.test.ts`, `docs.test.ts`, `helpers.ts`, `fixtures/hoy-main-P124.raw1`): 23 pruebas.
**Verificaciones:** `npm run typecheck`, `npx tsc --noEmit -p tests/acceptance`, `npx eslint tests/acceptance/F-017` y `prettier --check` salen limpios.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**check-scope verificador:** ✅. No hay archivos temporales; los dos que usé para generar el dato y sondear `prewarm` ya están borrados.
