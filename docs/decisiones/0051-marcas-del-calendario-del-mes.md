# ADR-0051 · Marcas del calendario del mes

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-013, D1 a D3)

## Contexto
El bloque `month-calendar` subrayaba con 1 px el día en que empieza un evento y no mostraba festivos. En 1 bit no hay color: el rojo de domingos y festivos del calendario impreso tiene que salir de la forma de la letra o de trazos, y los recuadros ya significan foco y «Enviando» (ADR-0048).

## Decisión
**Domingos y festivos en negrita**; **hoy invertido** (caja negra, número blanco, en negrita si es domingo o festivo); **raya de 2 px** debajo del número en cada día que cubre un evento. Junto al título del mes, a la derecha, `FESTIVO LUN 2 NOV` o `HOY FESTIVO` si cabe entero. Si la fila no deja espacio para la raya, la marca pasa a un punto de 5 px a la derecha del número cuando la columna lo permite; si no, se cuenta en `hidden`.

## Consecuencias
Los domingos van en negrita aunque no haya país configurado. Las medidas exactas (caja del número, separación y aire) están en F-013. El nombre del festivo no se muestra en el mes porque no cabe.
