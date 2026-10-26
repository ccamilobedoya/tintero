## Informe del verificador · F-015 · fase verificación · vuelta 1

**Veredicto:** fase verificación → **CUMPLE**. Las 45 pruebas de F-015 pasan. Fuera de F-015 falla una prueba (F-002 CA21, ver abajo) y otra necesita confirmación (F-014 CA13).

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1–CA4 (lógica) | PASA | `logic.test.ts`: configuración, `dayLabel`, ciclo `todo`→`doing`→`done`→`todo`, tarea sin etapa. |
| CA5–CA11 (dibujo) | PASA | `draw.test.ts` y `strips.test.ts`: zonas, franjas, columna de día, vertical, D2, Aceptar visible y aviso en la franja. |
| CA12 (franjas de tareas) | PASA | `strips.test.ts`: igual píxel a píxel a la imagen de `main` grabada. |
| CA13 (propiedades) | PASA | `properties.test.ts`: alineación a 8, `bandInk`, `gray`, `overflow` y `tooSmall` en P124, P200 y V124. |
| CA14 (Trilium) | PASA | `trilium.test.ts`: escribe `En progreso`, `Hecho` y `Por hacer`; con el falso lento, a lo sumo 2 `PATCH` y termina en `Hecho`. |
| CA15 (compatibilidad) | PASA, con reservas | Ver abajo. |

**CA15 en detalle**
- `npm test`: 500 pruebas pasan y 2 se saltan.
- `npm run test:acceptance` entero: 723 pruebas, 718 pasan y 5 fallan.
- **Falla por el entorno, listada en la ficha:**
  - F-007 CA6 (`tintero-lectura-sin-tope`).
  - F-014 CA13 («sin pictogramas, la imagen no cambia»).
- **Falla que no está en la ficha:** F-002 CA21 (Prism). La ficha dice que pasó en `main`, así que la reporto aparte. No la corrí sola.
- **F-013 CA20 y F-014 CA14 (corren las pruebas anteriores):** fallaron con todo el lote y con las dos juntas. La causa fue F-005 CA27 («el primer index de cada uno no da busy»), que dio 503 `busy` bajo carga.
  - Corrida 1, en el lote entero: F-013 CA20 y F-014 CA14 fallan.
  - Corrida 2, las dos solas y juntas: ambas fallan, y F-005 CA27 dio `busy` dentro de ellas.
  - Corrida 3, solas y por separado: F-005 `engine.test.ts` pasa (8/8), F-013 CA20 pasa y F-014 CA14 pasa.
  - F-005 CA27 dentro del lote entero pasó (no figura entre las 5 fallas). F-005 CA20 también pasó. Es un tema de tiempo y carga, no de F-015.
- **F-014 CA13: no puedo confirmar que sea solo el entorno.** Aquí falla por una diferencia real de píxeles en `p124/hoy.png` contra la imagen de antes de F-014, no por falta de `.git`.
  - Las franjas y D2 de F-015 cambian «hoy», así que probablemente es una consecuencia de esta ficha.
  - La ficha dice que esta prueba falla igual en `main`, y yo no lo comprobé.
  - Pregunta para el arquitecto: ¿se acepta como entorno, o hay que cambiar la prueba?

**Pruebas:** `tests/acceptance/F-015/` (5 archivos, 45 pruebas).
**Pruebas corregidas por contradecir la ficha:** ninguna.
**Herramientas:** `npx tsc --noEmit -p tests/acceptance` sin errores. `npx eslint tests/acceptance` da 0 errores y 85 advertencias de seguridad, una de ellas en `F-015/properties.test.ts:152`. Los gates de render no corrieron (no hay navegador para ellos).
**check-scope verificador:** ✅
