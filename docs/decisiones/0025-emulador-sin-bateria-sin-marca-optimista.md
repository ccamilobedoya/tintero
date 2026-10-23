# ADR-0025 · Emulador: sin estimar batería, sin marca optimista, pantalla en imágenes

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-002, puerta 1)

## Contexto
El emulador se porta como el ESP32 para probar el servidor y servir de referencia al firmware.

## Decisión
No estima energía (reporta peticiones, bytes y conexiones); no dibuja la marca ✓ optimista (muestra la vista que devuelve el servidor); lo que muestra el panel queda en `screen.png` y `screen.raw1`.

## Consecuencias
Pendiente para otra ficha: ver los puntos de foco de la navegación desde el emulador (vista web o segunda imagen con todas las zonas).
