## Informe del revisor · F-011 · modo juicio · vuelta 2

**Veredicto:** APROBADO CON MEJORAS (2)

Leí `git diff 0dc2e94 -- server/src/engine/chromium.ts` y el código alrededor. No ejecuté pruebas. R4–R7 quedaron resueltas de verdad.

- **R4:** el fallo inesperado del relanzamiento se registra como `{event:"defect", where:"chromium-restart"}` sin mensaje ni pila. `restarting` se limpia en `finally`, así que el estado no queda trabado. Cuando `inner` es `undefined` y no hay relanzamiento en curso, `render()` llama a `supervise(true)`, y ese es el reintento. Los `.catch(() => undefined)` que quedan son sobre un cierre viejo o un `rm` de algo que puede no existir, y los tres llevan comentario.
- **R5:** `streak` pasa por 0 (sin espera), 1 s, 2 s, 4 s… hasta 60 s. Vuelve a cero cuando han pasado al menos 60 s desde `upAt`, que se fija al quedar arriba. La espera es abortable con `stopper.signal`.
- **R6:** tras un `docker run` fallido o vencido se hace `rm -f <nombre>`. El nombre sale de `randomBytes` y se valida con `CONTAINER_NAME`, así que el borrado es solo del contenedor propio.
- **R7:** si falla la reconexión (`connectCdp`, con tope de 10 s), se relanza siempre con `rm -f current.name`. Esto cubre el Chromium vivo pero sordo. No se borra nada fuera del contenedor propio.
- **Carreras:**
  - **Dibujos en cola:** un solo relanzamiento a la vez (`restarting`). Los dibujos que fallan mientras tanto no hacen nada, y los que fallan tarde sondean el contenedor nuevo y no relanzan sin motivo.
  - **`stop()` durante un relanzamiento:** hace `abort`, espera a `restarting` y, si el contenedor quedó arriba, lo detiene; `bringUp` ya cierra y detiene lo recién creado.
  - **Sondeo colgado:** el sondeo y `docker` tienen tiempo de espera, así que `await restarting` en `stop()` no se cuelga.

**Bloqueantes** (vuelven al programador)
Ninguno.

**Mejoras** (se anotan en la ficha)
1. `chromium.ts:~575` y `~641` — `waitForDocker` lanza `"aborted"` cuando `stop()` llega durante un relanzamiento. Eso cae en el `.catch` de `supervise` y escribe un `defect chromium-restart` falso en un apagado normal. Corrección: en ese `catch`, no registrar nada si `isStopped()`.
2. `chromium.ts:~610` — `supervise()` sin `force` con `current === undefined` ahora relanza, porque la condición `!force && current !== undefined` ya no frena. Es inofensivo y probablemente deseado, pero conviene dejarlo escrito en el comentario o cubrirlo con una prueba, porque cambió el comportamiento respecto a la vuelta 1.

**Lecciones candidatas**
- Ninguna nueva.

