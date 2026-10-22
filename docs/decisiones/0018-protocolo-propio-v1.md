# ADR-0018 · Protocolo propio de Tintero (no TRMNL) en v1

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-001, puerta 1)

## Contexto
Con L1 (certificado por pantalla) un aparato TRMNL comercial no puede conectarse igual, y la navegación por zonas (B/C) no existe en TRMNL.

## Decisión
La API de aparatos v1 es propia: `/api/v1` con índice, imagen, zonas, acciones y registro (F-001). Un adaptador TRMNL se evalúa después, para la versión pública.

## Consecuencias
El contrato se diseña para el ESP32 sin arrastrar la forma de TRMNL.
