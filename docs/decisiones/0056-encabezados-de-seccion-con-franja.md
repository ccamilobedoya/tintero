# ADR-0056 · Un solo encabezado de sección: la franja

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-015, D1 y D2)

## Contexto
En «hoy», cada bloque tenía su propio encabezado: franja negra («EN PROGRESO»), franja con raya («POR HACER»), un título de 12 pt («Próximos eventos») y una línea sin raya para el mes. Los eventos se veían como de otra pantalla, y las filas de día les quitaban espacio.

## Decisión
Todo encabezado de bloque es la **franja** de `task-board`: texto de detalle en negrita y mayúsculas, espaciado de 1 px, un texto corto a la derecha (cuenta, aviso «sin datos desde» o, en el mes, el próximo festivo) y una raya de `line` abajo. Solo la primera sección de la vista que manda la lleva en negativo. En la agenda de «hoy», el día pasa a una **columna** (`Hoy`, `Mañana`, `Mié 28`) escrita solo en el primer evento de cada día, en lugar de filas de día. Una fila grande o tarjeta de tarea sin fecha ni categoría no reserva la línea de debajo.

## Consecuencias
Un encabezado se ve igual en cualquier bloque nuevo. En «hoy» caben 4 eventos en vez de 3 y una tarea más en *Por hacer*. La agenda de pantalla completa conserva las filas de día (opción `layout` del bloque `agenda`).
