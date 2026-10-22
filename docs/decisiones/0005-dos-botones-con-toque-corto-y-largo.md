# ADR-0005 · Dos botones con toque corto y largo

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
Navegación tipo teclado con el mínimo de hardware.

## Decisión
Mover: corto = siguiente elemento (`Tab`), largo = siguiente vista. Aceptar: corto = marcar o abrir detalle; largo = volver (en un detalle) o actualizar ya (en una vista).

## Consecuencias
El protocolo lleva acciones por zona; el firmware distingue toques cortos y largos.
