## Informe del verificador · F-011 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → **PRUEBAS LISTAS**. Tres detalles quedan abiertos, listados al final.

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `docker.test.ts`: con el Docker falso (N=3), `waitForDocker` hace 4 llamadas a `version`. Las esperas son 1000, 2000 y 4000 ms, y hay una línea `ok:false` y una `ok:true` con `waitedS`. Otras pruebas del mismo archivo cubren la secuencia hasta 60000 ms, un registro de fallo por hora y el uso de `signal`. `live.test.ts`: el servidor real con N=2 no sale, escribe `listening` y el index da 200. |
| CA2 | PRUEBA ESCRITA | `live.test.ts`: servidor real con `--instance f011-<hex>` y `--port 0`. Dibuja una vista y hace `docker kill` de su contenedor. Luego pide el index con otro panel (`P124` y `P200`), porque con el mismo no habría que redibujar. Comprueba que todo estado es 200 o 503 `busy`, que una vista nueva se dibuja en ≤ 30 s, que el PID es el mismo y que hay una línea `restart`. Al final debe quedar exactamente 1 contenedor etiquetado, distinto del anterior. Solo toca contenedores de su instancia. |
| CA3 | PRUEBA ESCRITA | `docker.test.ts`: `chromiumDockerArgs` lleva `--pull never` antes de la imagen. `startChromiumService` con la imagen inexistente y el Docker falso deja la línea `image-missing` y hace `image inspect`. Ninguna llamada es `pull` ni `run` con esa imagen. El Docker falso bloquea `rm`/`kill`/`stop` en esta prueba para no tocar otros contenedores. |
| CA4 | PRUEBA ESCRITA | `fatal.test.ts`: `unhandledRejection` deja una línea con las claves exactas `ts`/`event`/`kind` y sin el mensaje del error. `shutdown` se llama una vez y luego `exit(1)`. Un segundo evento no hace nada. Con reloj simulado, `exit(1)` ocurre a los 30 s aunque `shutdown` no termine. También cubre `uncaughtException`. |
| CA5 | PRUEBA ESCRITA (5 de 6 sub-casos) | `f009.test.ts`: (1) un `saveState` que lanza una vez no impide el siguiente guardado. (2) Con un `setSource` que lanza, tres ciclos dejan tres líneas `defect/cycle` con claves exactas, sin mensaje y sin `read ok:false`. Un fallo de red sigue siendo `read ok:false`. (3) Una escritura fallida deja `pending` con `code:"network"`. (4) Un enlace simbólico en `<estado>.tmp-<pid>` (a un archivo o colgante) no se sigue, y un resto normal se reemplaza. (5) CA17–CA20 y CA23 de F-009 se comprueban en la fase de verificación con las pruebas de F-009. |
| CA6 | PRUEBA ESCRITA | No necesita prueba nueva: es `npm run test:acceptance` completo, que corro en la fase de verificación. |
| CA7, CA8 | — | En vivo, sin prueba automática, como pide el encargo. |

**Pruebas:** `tests/acceptance/F-011/{helpers,docker.test,fatal.test,live.test,f009.test}.ts`, unas 25 pruebas.

**Estado actual:**
- **`npm run typecheck`:** limpio.
- **`tsc -p tests/acceptance` y `eslint`:** solo fallan porque `waitForDocker`, `startChromiumService` y `server/src/fatal.ts` aún no existen.
- **Prueba de CA5 contra el código actual:** `f009.test.ts` da 3 pasan y 4 fallan. Los fallos son los de (2), (3) y los dos de (4), que son las mejoras pendientes. Los tests de docker, fatal y live aún no pueden correr.

**Pruebas corregidas por contradecir la ficha:** ninguna.

**check-scope verificador:** ✅

**Puntos abiertos para el arquitecto:**
1. **CA5 (5): NO VERIFICABLE.** «`loadState` lee del mismo descriptor que midió» no se puede provocar desde fuera. Pregunta: ¿qué señal observable debe quedar, por ejemplo que un archivo cambiado entre medir y leer se rechace con `too-large` o `permissions`?
2. **Ambigüedad en `main.ts`:** «la primera línea `{"listening"}`» choca con las líneas `docker ok:false` que se escriben antes por stdout. Mi prueba solo exige que exista una línea `listening`, no que sea la primera. Pregunta: ¿el registro de espera sale antes de `listening`, o `listening` debe ir primero?
3. **Supuesto en `startChromiumService`:** tras una falla, la prueba de `image-missing` abandona el bucle colgando `sleep` en la segunda espera. Supone que la línea se registra antes de la primera espera.

