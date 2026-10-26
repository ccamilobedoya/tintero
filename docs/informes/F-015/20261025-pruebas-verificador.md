## Informe del verificador · F-015 · fase pruebas · vuelta 1

**Veredicto:** fase pruebas → PRUEBAS LISTAS

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | PRUEBA ESCRITA | `logic.test.ts`: contenido de los ejemplos, `lista` → `must be days or column`, `column` en `tareas` → `unknown field`. |
| CA2 | PRUEBA ESCRITA | `logic.test.ts`: los valores de la ficha, más los 7 días de la semana. |
| CA3 | PRUEBA ESCRITA (parcial) | Tres `toggle` con `onToggle`, `duplicate` y `b-01`. `doneAt` ausente no se ve desde fuera; ver la nota abajo. |
| CA4 | PRUEBA ESCRITA | `t-001` alterna sin llamar a `onToggle`. Añadí una tarea sin etapa en `task-board` (R2). |
| CA5 | PRUEBA ESCRITA | `draw.test.ts`: 12 zonas, `hidden`, acciones, ids, más el presupuesto de 420 ms (mediana). |
| CA6 a CA8 | PRUEBA ESCRITA | `draw.test.ts`: los píxeles y rectángulos de la ficha en P124 y V124. |
| CA9 | PRUEBA ESCRITA | Alturas 66, 86, 52 y 72. La ficha no da el marcado de la «línea de detalle»: uso la letra `Terminus` dentro del HTML de la fila. |
| CA10 | PRUEBA ESCRITA | Zonas, `hidden.tareas = 5` y la casilla a medias. Al tercer `toggle` las zonas y el `hash` vuelven a ser los de CA5. |
| CA11 | PRUEBA ESCRITA | `sin datos desde 07:50` frente a `12` en el HTML de la franja. |
| CA12 | PRUEBA ESCRITA | `strips.test.ts` con `fixtures/hoy-main-P124.raw1`, dibujada con el motor real sobre `main`. |
| CA13 | PRUEBA ESCRITA | `properties.test.ts`: 4 conjuntos × 3 paneles. `tooSmall` de `main` medido por mí; incluye `hoy` reconstruido sin `layout`. |
| CA14 | PRUEBA ESCRITA | `trilium.test.ts`: En progreso, Hecho, Por hacer; el falso lento hace ≤ 2 `PATCH` y termina en Hecho. |
| CA15 | PRUEBA ESCRITA (sin archivo) | Se comprueba corriendo `npm run test:acceptance` entero en la fase de verificación. Una prueba que la lance recursaría. |

**Nota sobre CA3:** desde fuera solo se ve la etapa y que `doneAt` cae en el 26 en Lima. «Sin `doneAt`» al volver a *doing* o *todo* no es observable; lo cubre la prueba unitaria del programador.

**Estado de las pruebas:** fallan, como se esperaba, porque el código no existe y `config/hoy.*.example.json` tampoco. Para comprobar la mecánica creé esos dos ejemplos de forma temporal, sin `layout`, y los borré. Con ellos, las pruebas se ejecutan y fallan solo donde `main` difiere de la ficha.

**Pruebas anteriores actualizadas, solo lo que dice la sección:**
- F-006 CA3, CA4, CA8, CA9 y CA13 (vista previa de `hoy`, de 9 a 10 zonas).
- F-006 CA6 (tres `toggle`).
- F-008 CA4, CA5 y CA6.
- F-009 CA7 y CA9.
- F-013 CA6 a CA9 y CA19 (`y` +2 en los días del mes).

Dos valores salen de mi cálculo y no están escritos en la ficha:
- F-008 CA6, tras dos `toggle`: `hidden.tareas = 2`.
- F-006 CA6, tras el segundo `toggle`: `hash` distinto al inicial y primera zona distinta de `b-01`.

**Pruebas:** `tests/acceptance/F-015/{helpers,logic,draw,strips,properties,trilium}.ts` (46 casos) y `fixtures/hoy-main-P124.raw1`.
**Pruebas corregidas por contradecir la ficha:** ninguna.
**Comprobaciones:** `npm run typecheck`, `tsc -p tests/acceptance` y `prettier --check` sin errores. `eslint` da 0 errores y 85 avisos, los de antes más 2 nuevos de object-injection.
**Pendiente:** no pude borrar `(un archivo temporal fuera del repo, ya borrado)`, un script temporal fuera del repo (el borrado pedía aprobación).
**check-scope verificador:** ✅
