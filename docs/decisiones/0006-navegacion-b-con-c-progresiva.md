# ADR-0006 · Navegación B con C progresiva

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
Con batería, ir al servidor en cada toque cuesta segundos.

## Decisión
El servidor manda la imagen y un mapa de zonas; el ESP32 dibuja solo el recuadro del foco con refresco parcial. Las vistas se guardan en la flash (4 MB alcanzan) con C progresiva: índice con huellas, primero la vista actual, una vista a la vez sobre la misma conexión, presupuesto por despertada (todas con USB), y si falta una, se pide en el momento (B). El servidor dibuja solo cuando cambian los datos, en segundo plano.

## Consecuencias
Extensión propia del protocolo (un aparato TRMNL funciona sin foco). Nada en paralelo en el ESP32.
