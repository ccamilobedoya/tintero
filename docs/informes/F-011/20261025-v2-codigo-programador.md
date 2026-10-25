# Informe del programador · F-011 · vuelta 2

**Resultado:** hecho. R4, R5, R6 y R7 están implementados. Las pruebas de aceptación de CA9 y CA10 no las ejecuté ni las vi (no leo `tests/acceptance/`).

**Cambios**, todos en `server/src/engine/chromium.ts` y su prueba:
- **R6:** si `docker run` falla o vence, `runChromium` hace `docker rm -f <nombre>` del contenedor propio y vuelve a lanzar el error. Vale con o sin instancia.
- **R7:** quité el chequeo `inspect … Running`. Tras un dibujo fallido, se intenta una conexión CDP nueva.
  - Si esa conexión falla, se relanza siempre: `rm -f` del contenedor propio, esté corriendo o no, y se arranca otro.
  - Si la conexión funciona, no se relanza, porque el fallo fue del dibujo y no de Chromium.
- **R5:** una racha de relanzamientos tiene espera creciente de 1 s, 2 s, 4 s… hasta 60 s. La racha vuelve a cero tras 60 s de funcionar bien.
  - El primer relanzamiento de una racha no espera.
  - La espera se mide con el `clock` y el `sleep` inyectables del servicio.
- **R4:** el `.catch(() => undefined)` del relanzamiento ahora registra `{ts, event:"defect", where:"chromium-restart"}`, sin mensaje ni pila. Si el relanzamiento termina en `defect`, el siguiente dibujo que llegue sin renderizador lo reintenta, así que el estado no queda trabado. Los `catch` vacíos que quedan son al cerrar o borrar lo viejo, con comentario.

**Pruebas nuevas:** el `docker` falso de `chromium.test.ts` ahora admite que `image inspect` pase y que `run` falle. La prueba nueva comprueba que cada `run` fallido tiene su `rm -f <nombre>`. No hay prueba unitaria de R4, R5 ni R7, porque hace falta un Chromium de verdad o un fallo interno difícil de provocar.

**Comprobaciones:**
- `typecheck`, `format:check` y `check-scope` pasan.
- `lint` pasa con 0 errores y 77 avisos que ya estaban en las pruebas de aceptación.
- `npm test` pasa: 391 pruebas pasadas y 2 omitidas.
- `npm run test:acceptance`: 463 pasan y 1 falla (F-007 CA6). Ese test pide `.revisar/semgrep.json`, que solo existe después de correr `tools/revisar --base main`; no tiene relación con este cambio. No corrí `tools/revisar`.
- No toqué el servicio real del puerto 8790 y no dejé archivos temporales.

**Para decidir:** la ficha dice «la reconexión también falla» pero no cómo comprobarlo. Elegí una conexión CDP de prueba con tope de 10 s, así que un dibujo que falla con Chromium sordo puede tardar hasta unos 20 s antes del relanzamiento. Entra en los 45 s de CA9, pero conviene confirmarlo en la verificación en vivo.

