# ADR-0038 · El tipo común de tareas lleva una etapa

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-006, puerta 1, D2)

## Contexto
Un tablero tiene más de dos estados, y Jira (ADR-0011) tiene los suyos. ADR-0009 pide que los bloques dependan del tipo de dato, no de la integración.

## Decisión
`Task` gana **`stage`** (`todo` \| `doing` \| `done`) y **`doneAt`**. Cada integración traduce sus estados a las tres etapas (Trilium por el nombre de la columna; Jira por su `statusCategory`). Sin `stage`, vale `done ? "done" : "todo"`.

## Consecuencias
Los datos de F-005 siguen sirviendo. El bloque `task-board` sirve igual para Trilium y para Jira.
