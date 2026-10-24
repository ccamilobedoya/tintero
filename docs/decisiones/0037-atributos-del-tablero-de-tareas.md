# ADR-0037 · Atributos del tablero de tareas

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-006, puerta 1, D1, D6 y D7)

## Contexto
ADR-0010 dejó los atributos de las tarjetas para cuando hubiera diseños. Los diseños de F-006 muestran cuánto cabe, y crear una tarea desde el celular tiene que costar lo mínimo.

## Decisión
Cada tarjeta lleva **`status`** (columnas *Por hacer*, *En progreso*, *Hecho*) y, opcionales, **`categoria`** (selección) y **`vence`** (fecha). **Sin prioridad:** el orden es la posición de la tarjeta en el tablero, también en la pantalla; las vencidas no suben, se marcan. **Sin fecha de cierre propia:** se usa la fecha de modificación de `status`. Una tarea *Hecho* se ve en la pantalla **hasta la medianoche local** del día en que se cerró.

## Consecuencias
Una tarjeta se crea solo con el título. Los nombres de las columnas se configuran (el documento 1 decía *Hecha*; manda el tablero). **`categoria` queda pospuesta** (dueño, 2026-10-24): el tablero arranca solo con `status` y `vence`, y los bloques ponen encabezados de categoría solo si alguna tarea trae una.
