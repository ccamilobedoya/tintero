# Informe del verificador — F-013 (fase «pruebas»)

**Veredicto: PRUEBAS LISTAS.** Ningún CA quedó NO VERIFICABLE. Hay supuestos que dejé anotados más abajo.

Escribí las pruebas en `tests/acceptance/F-013/`. Todavía no corrí nada contra una implementación, porque el código de F-013 no existe.

- **Compilación:** `tsc -p tests/acceptance` solo falla donde se espera. Faltan `holidays.ts`, `eventDays` y `holidays-nager.ts`, y de ahí salen los `any` implícitos que se arrastran. ESLint da errores `no-unsafe-*` solo por esos mismos módulos sin resolver. Quité las directivas sobrantes.
- **Alcance:** `tools/check-scope verificador --base ficha/F-013` limpio. No hice commit.

## Cobertura por CA
| CA | Archivo | Qué comprueba |
|----|---------|---------------|
| 1 a 5 | `logic.test.ts` | Configuración y punteros de error, `applyCorrections`, `holidayLabel`/`nextHoliday`, `eventDays` (Lima) y `setHolidays` (con el `hash` de `hoy`). |
| 6 a 11 | `draw.test.ts` | Motor real con Chromium, `P124` y `V124`, y los píxeles exactos de la ficha. CA7 lee las negritas del HTML dibujado. CA10 usa la vista `mini`. |
| 12 a 16, 18 | `integration.test.ts` | Servidor falso de Nager.Date en 127.0.0.1, reloj inyectado, respuestas grabadas en `fixtures/` (los 19 de 2026 y 3 de 2027). Cubre caché, filtros, 404, cliente con guardia y registros. |
| 17, 19 | `cli.test.ts` | Servidor real con `festivos` apagada y `npm run render --holidays` (PNG, archivo de 65 KiB y fecha mala, ambos con código 2). También comprueba los ejemplos de `config/`. |
| 20 | `previous.test.ts` | Corre `test:acceptance` de F-005, F-006 y F-008 como subproceso. |

Las pruebas de CA6 a CA11 y CA17 a CA20 necesitan Docker y Chromium, y las de CA19 a CA20 tardan varios minutos.

## Supuestos
1. **CA7:** `monthCalendar` no se llama con un contexto propio. Leo el HTML completo que recibe el renderizador y busco el elemento cuyo texto es el número. Si el mismo número aparece en otro bloque, puede dar un falso positivo.
2. **CA10:** solo compruebo `hidden.mes = 7`. No verifiqué "sin marcas de evento" en píxeles, porque no sé si el aviso de `hidden` se dibuja y cambiaría la imagen.
3. **CA14:** la ficha no dice dónde se registra `too-large`. Busco esa cadena en cualquier línea registrada.
4. **CA1:** para un campo desconocido en `holidays` exijo el puntero `/holidays`, siguiendo la convención del puntero del objeto padre.
5. **CA12:** exijo que `setHolidays` reciba la lista de ambos años cuando se piden 2026 y 2027. El tope `maxBytes: 65_536` lo pongo yo al construir el cliente en la prueba, porque `createHolidays` no recibe ese parámetro.
6. **Manifiesto de `festivos`:** el contrato no da el nombre con que se exporta. Lo reproduzco literal en `helpers.ts`.
7. **Pruebas extra** fuera de los CA: archivo de caché dañado o de otro país (R6), límite exacto de 65 536 bytes, rutas ajenas rechazadas, y que el ejemplo de `integrations` y `calendario.data` coincidan con lo que dice la ficha.

