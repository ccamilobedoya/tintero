# ADR-0004 · HTTPS siempre entre pantalla y servidor

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
Las pantallas también funcionan fuera de la red de la casa.

## Decisión
Toda comunicación pantalla–servidor va por HTTPS, en casa y fuera.

## Consecuencias
Más memoria y tiempo despierto en el ESP32 (se mide con la placa real).
