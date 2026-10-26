# ADR-0055 · Aceptar sobre una tarea avanza una etapa

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-015, D3)

## Contexto
Con ADR-0039, Aceptar sobre una tarea la marcaba **Hecho** y otro Aceptar la devolvía a la etapa que tenía. El dueño quiere que una tarea de *Por hacer* pase a *En progreso* desde la pantalla. Había tres opciones: un ciclo, avanzar con *Hecho* que reabre a *En progreso*, o retroceder con Aceptar largo (que cambiaba ADR-0005 y el firmware).

## Decisión
Aceptar corto sobre una tarea la pasa a la **etapa siguiente, en ciclo**: *Por hacer* → *En progreso* → *Hecho* → *Por hacer*. Reemplaza a ADR-0039.

## Consecuencias
Un toque siempre significa «siguiente etapa», y la casilla (vacía, a medias, llena) ya dibuja esa secuencia. El motor deja de recordar la etapa anterior de cada tarea (la recordaba solo en memoria). Corregir un toque por error cuesta dos toques más; si la tarea ya pasó a *Hecho* en una vista que no muestra las hechas, se corrige desde la que sí las muestra. Las tareas sin etapa de `task-list` siguen alternando entre hecha y no hecha. ADR-0005 no cambia.
