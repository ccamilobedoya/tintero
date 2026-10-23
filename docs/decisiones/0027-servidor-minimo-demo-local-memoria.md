# ADR-0027 · Servidor mínimo: vistas de demostración, solo 127.0.0.1, estado en memoria

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-003, puerta 1)

## Contexto
Hace falta probar el ciclo pantalla ↔ servidor antes del motor de vistas, la autenticación y la base de datos.

## Decisión
F-003 sirve vistas de demostración dibujadas por código para cualquier panel (incluido un patrón de calibración de 1 cm con los ppp); no tiene autenticación, así que solo escucha en 127.0.0.1 y se niega a otra dirección (falla cerrado) hasta F-004; el estado vive en memoria.

## Consecuencias
La base de datos se decide con la primera integración real; la exposición, con F-004.
