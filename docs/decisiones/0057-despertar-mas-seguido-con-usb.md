# ADR-0057 · Con USB, la pantalla despierta más seguido

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-017)

## Contexto
El servidor mandaba el mismo `next_wake_s` (1800 s) a toda pantalla. Con USB no hay batería que cuidar, y media hora es mucho para ver una tarea o un evento nuevo. La pantalla ya dice cómo se alimenta en cada petición (`Tintero-Power`).

## Decisión
`next_wake_s` depende de `Tintero-Power`: **600 s con `usb`** y 1800 s con `battery`. Los dos valores se configuran en el servidor (`--next-wake-usb-s` y `--next-wake-s`).

## Consecuencias
Sin cambio de contrato: es el mismo campo, dentro de 30–86 400 s. El firmware solo tiene que obedecer `next_wake_s` (ya lo hace). El servidor dibuja por adelantado según el intervalo de cada pantalla. Con USB son 3 veces más índices por hora (cada uno es pequeño y casi siempre sale de la caché).
