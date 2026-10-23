# ADR-0024 · Campo opcional `parent` para las vistas de detalle

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-002, puerta 1)

## Contexto
«Aceptar largo» vuelve atrás desde un detalle (ADR-0005), pero el contrato v1 no decía qué vista es un detalle.

## Decisión
Cada vista del índice puede traer `parent` (id de otra vista del mismo índice). Volver es **local, sin red**. Cambio **aditivo** de v1: quien no lo conoce lo ignora. `validateIndex` rechaza un `parent` inexistente o igual a su propia vista (`unknown_parent`).

## Consecuencias
Se implementa en F-002 junto con el emulador. La alternativa (acción `back` al servidor) gastaría WiFi en cada vuelta atrás.
