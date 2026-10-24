# ADR-0041 · Las integraciones escriben sin pisar y caen con gracia

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-006, puerta 1, D9 y D10)

## Contexto
La tarea se puede cambiar desde el celular y desde la pantalla, y la fuente puede no responder.

## Decisión
Una escritura solo se hace si el valor en el servicio **sigue siendo el que se leyó**; si cambió, **gana el servicio** y la acción se descarta y se registra. Sin conexión, la marca queda en memoria (la pantalla ya la muestra) y se reintenta en cada lectura durante 24 h. Si la última lectura buena tiene más de **5 min**, la vista lo dice con la hora absoluta: «sin datos desde HH:MM».

## Consecuencias
Nunca se pisa un cambio hecho desde el celular. El motor recibe la hora de la última lectura buena por `setSource`.
