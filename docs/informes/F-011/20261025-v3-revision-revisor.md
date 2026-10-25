## Informe del revisor · F-011 · modo juicio · vuelta 3

**Veredicto:** APROBADO

**Bloqueantes**
- Ninguno.

**Confirmaciones**
1. **Ningún cierre cuelga el camino de error ni el relanzamiento.** Todos los cierres de `Renderer` y de la sonda de reconexión pasan por `closeBounded`, con tope de 2 s. Esos cierres están en `dropCached`, `pageFor` (camino de error), `Renderer.close()` y `reconnects`. El tope se puede ajustar con `closeTimeoutMs`. El temporizador se limpia en `finally`, y `.catch` evita rechazos sin atender.
   - Lo que queda sin tope no cuelga a nadie. `supervise` llama a `old.close()` sin esperarlo (`chromium.ts:650`). Los `docker rm -f` llevan tiempo de espera de 15 s.
2. **Un cierre abandonado por el tope no deja nada peligroso.** La promesa de `close()` sigue pendiente en segundo plano, pero el contenedor se elimina después con `docker rm -f`, así que no queda ningún Chromium vivo. Además `rendererClosed` y `stopped` impiden nuevos relanzamientos. La fuga queda acotada a una promesa y un socket CDP muertos por cierre, y se libera al caer el contenedor.
3. **No se esconden defectos (regla 12).** El `defect` solo se omite cuando `isStopped()` es verdadero, porque ahí el fallo es esperado. Un fallo real de relanzamiento sigue registrándose y el siguiente dibujo fallido reintenta.

**Mejoras** (se anotan en la ficha)
- `chromium.ts:650`: el `old.close()` sin esperar usa el tope de 2 s por defecto del `Renderer` viejo. Es correcto, pero una prueba que fije ese comportamiento evitaría que alguien lo cambie sin darse cuenta. Es de baja prioridad.

**Lecciones candidatas**
- Ninguna.

