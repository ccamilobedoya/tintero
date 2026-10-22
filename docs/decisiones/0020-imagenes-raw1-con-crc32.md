# ADR-0020 · Imágenes `raw1` con CRC32 primero

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-001, puerta 1)

## Contexto
Medido: una vista de texto pesa 48 000 B en `raw1` y unos 4–5 KB en `png1`. `raw1` no necesita decodificador; `png1` baja menos bytes por la radio.

## Decisión
Se empieza con `raw1` (48 000 B, MSB primero, 1 = negro) y un CRC-32 estándar por vista en el índice. `png1` queda descrito en el contrato, sin implementar. El aparato declara sus formatos en `Tintero-Formats` y el servidor solo manda esos.

## Consecuencias
Firmware más simple de escribir. Antes de pasar a `png1` se compara la batería con la placa real, con datos.
