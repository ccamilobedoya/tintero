# Informe del verificador · F-011 · fase «pruebas» · vuelta 2

**Veredicto: PRUEBAS LISTAS.** Ninguna de las pruebas nuevas se ha corrido, porque el código de la vuelta 2 aún no existe.

**Archivo nuevo:** `tests/acceptance/F-011/vuelta2.test.ts`. No toqué lo anterior y no leí `server/`.

| CA | Prueba | Qué comprueba |
|---|---|---|
| CA9 | Docker real, instancia propia, `--port 0` | Dibuja una vista y hace `docker pause` del contenedor. Mientras espera, todas las respuestas son `200` o `503 busy`. En ≤ 45 s se dibuja bien un panel nuevo con el mismo PID. Hay una línea `restart`. Al final queda 1 contenedor de la instancia, distinto del pausado. |
| CA10 | Docker falso, dos variantes | `run` crea el contenedor de verdad y luego sale con 1, o se queda dormido. Tras 2 intentos hay un `rm -f <nombre>` por cada uno, después de ese `run` y antes del siguiente. No queda ningún contenedor con esos nombres ni con la etiqueta de la instancia. |

**Limpieza:** `afterEach` hace `unpause` (por si quedó pausado) y `rm -f` de la instancia y de los nombres de los intentos. Borra también la carpeta temporal del Docker falso. No toqué el servicio real (instancia `servicio`, puerto 8790).

**Supuestos:**
- **Tope de `docker run`:** la ficha no da el valor. La variante «tarda más que el tope» duerme 900 s y la prueba espera hasta 170 s a que se hayan hecho los dos intentos. Si el tope real es mayor, esa variante falla. Pregunta para el arquitecto: ¿cuál es el tope de `docker run`?
- **Nombre del contenedor:** lo leo de `--name <n>` o `--name=<n>` en los argumentos de `run`.
- **Esperas en CA10:** las dos primeras pasan sin esperar y la tercera se cuelga para parar el bucle.

**Herramientas:**
- `npm run typecheck` y `eslint` dan errores solo porque faltan `waitForDocker`, `startChromiumService` y `fatal.ts`. Es lo esperado antes del código.
- Mi archivo tiene además un aviso de eslint (`security/detect-object-injection`) en un acceso por índice. No bloquea.
- `tools/check-scope verificador --base main`: limpio.

Sin *commit*.

