# ADR-0011 · Jira Cloud, solo lectura

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
El dueño quiere ver en la pantalla las tareas que tiene asignadas en Jira.

## Decisión
Integración de solo lectura contra Jira Cloud (`*.atlassian.net`). Propuesta: token con permiso `read:jira-work`, para que la solo lectura la garantice el proveedor.

## Consecuencias
Los pendientes privados de esta integración se llevan fuera del repo.
