# ADR-0033 · Vistas y datos de prueba en archivos JSON

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D3 y D4)

## Contexto
El motor necesita saber qué vistas tiene cada pantalla y con qué datos dibujarlas antes de que existan la web de configuración, la base de datos y las integraciones.

## Decisión
Un archivo JSON de vistas (`--views`) y uno de datos de prueba (`--data`) con los tipos comunes `tasks` y `events`, fuera del repo, con ejemplos en `config/`. Se leen al arrancar; marcar una tarea la cambia en memoria.

## Consecuencias
La web y la base de datos los reemplazan en su ficha; las integraciones entregan datos al motor por la misma puerta (`setSource`).
