# F-999 · Porcentaje de batería (ficha de juguete)

**Estado:** aprobada (solo para la regresión de los agentes)
**Modelo del programador:** haiku (ficha mecánica)
**Dependencias nuevas permitidas:** ninguna

## Contexto
La pantalla muestra la carga de su LiPo 1S como porcentaje.

## Contrato
`tests/agents/toy/battery.ts` exporta `batteryPercent(millivolts: number): number`.

## Criterios de aceptación
- **CA1.** Escala lineal: **3300 mV = 0 %** y **4200 mV = 100 %**, redondeado al entero más cercano (`Math.round`). Ejemplos: 3750 → 50; 3390 → 10.
- **CA2.** El resultado siempre está entre 0 y 100, incluidos: 3000 → 0; 4350 → 100.
- **CA3.** Si `millivolts` no es un número finito (`NaN`, `Infinity`, `-Infinity`), lanza `RangeError`.

## Archivos
`tests/agents/toy/battery.ts`
