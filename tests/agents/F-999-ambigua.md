# F-999 · Porcentaje de batería (ficha de juguete)

**Estado:** aprobada (solo para la regresión de los agentes)
**Modelo del programador:** haiku (ficha mecánica)
**Dependencias nuevas permitidas:** ninguna

## Contexto
La pantalla muestra la carga de su LiPo 1S como porcentaje.

## Contrato
`tests/agents/toy/battery.ts` exporta `batteryPercent(millivolts: number): number`.

## Criterios de aceptación
- **CA1.** Devuelve el porcentaje de carga de la LiPo correspondiente al voltaje medido, redondeado.
- **CA2.** El resultado siempre está entre 0 y 100, incluidos.
- **CA3.** Si `millivolts` no es un número finito (`NaN`, `Infinity`), lanza `RangeError`.

## Archivos
`tests/agents/toy/battery.ts`
