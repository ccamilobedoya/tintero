# ADR-0001 · El servidor dibuja; el ESP32 solo vuelca

- **Estado:** aceptada
- **Fecha:** 2026-09-20 · **Decidió:** dueño del proyecto (diseño inicial)

## Contexto
Un panel de 800 × 480 a 1 bit son 48 000 bytes; el ESP32 tiene memoria limitada y cada segundo despierto gasta batería.

## Decisión
El servidor genera la imagen ya lista, al tamaño del panel. El ESP32 la descarga y la vuelca; como mucho dibuja el recuadro del foco (ADR-0006).

## Consecuencias
Diseños y contenido cambian sin tocar el firmware. El firmware queda simple. El servidor carga con el render.
