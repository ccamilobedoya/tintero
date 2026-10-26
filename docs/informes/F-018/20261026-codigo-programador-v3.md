# Informe del programador — F-018, vuelta 3

## Estado
Listo, salvo `node tools/lib/public-scan.ts --tree`: el entorno me pidió aprobación y no pude correrlo. Hay que ejecutarlo antes de integrar.

## Qué hice
- **CA9 y CA10b:** quité `LETTERS` de `month-calendar.ts`. Ahora las iniciales salen de `msgs.weekdayLetters`, una clave nueva del catálogo en `i18n/index.ts`.
  - `en` usa `M T W T F S S`.
  - `es` conserva `L M M J V S D`, así que con `es` la imagen no cambia.
  - `i18n.test.ts` comprueba que hay 7 entradas por idioma y los valores de ambos.
- **Textos fijos fuera del catálogo:** revisé todos los bloques y no queda ningún texto dibujado fuera del catálogo. Encontré tres cosas que no se dibujan y dejé como están:
  - `engine.ts:146` y `:147`: `title: "Detalle"` y el área `"detalle"` de `DETAIL_DEF`. Son internos: el detalle dibuja `msgs.detail`.
  - `agenda.ts:75`: el id de pictograma `"estrella"`. Es un identificador, no texto.
  - Comentarios que citan «sin datos desde» y «+N más», en `types.ts`, `common.ts`, `task-board.ts`, `view.ts`, `engine.ts`, `dates.ts` y `holidays.ts`. Siguen en español; no los toqué.
- **`firmware/README.md`:** ahora está en inglés, con el enlace «Leer en español» y los mismos títulos `##` y `###` que el par.
- **`firmware/README.es.md`:** nuevo, con el contenido en español y el enlace «Read in English».
- **Guías de hardware:** quité «(in Spanish)» de `docs/guide/en/hardware.md`. Ahora la guía en inglés enlaza `firmware/README.md` y la guía en español enlaza `firmware/README.es.md`.
- **`server/README.md`:** su referencia pasó a `firmware/README.es.md`, que sigue en español. No estaba en tu lista; lo hice para no dejar el enlace apuntando a la versión en inglés.

## Verificación
- `typecheck`: pasa.
- `lint`: sin errores. Quedan 85 avisos, todos en `tests/acceptance/**`, que no es mío.
- `npm test`: 546 pasan, 2 saltadas. Durante la corrida salieron dos mensajes de hook («Bloqueado…») pero no hubo fallos.
- `format:check`: pasa.
- `tools/check-scope programador --base arq/F-018`: dentro de alcance.

## Archivos fuera de la sección Archivos de la ficha
- `server/README.md`: el cambio de enlace descrito arriba.
- `firmware/README.es.md`: archivo nuevo, pedido por ti.
