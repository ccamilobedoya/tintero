# ADR-0049 · Trazos de al menos 2 px y una vista de calibración

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-008, D3)

## Contexto
Con el refresco completo rápido el negro se ve gris oscuro y las líneas de 1 px quedan tenues. Las rayas y bordes ya miden 2 px a 124 ppp; el tachado y Terminus normal son de 1 px.

## Decisión
Rayas, bordes y tachado miden **al menos 2 px**. Antes de cambiar letras, el servidor ofrece una **vista de calibración** (líneas de 1, 2 y 3 px, Terminus normal y negrita, DejaVu, casillas, etiqueta de vencida y anillos de muestra) para mirarla en el panel real y decidir con evidencia (M9).

## Consecuencias
La letra de los detalles (ADR-0034, «por ahora») se decide después de mirar la calibración en el panel.
