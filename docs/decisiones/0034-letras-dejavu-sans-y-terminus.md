# ADR-0034 · Letras del tema base: DejaVu Sans y Terminus

- **Estado:** aceptada
- **Fecha:** 2026-10-23 · **Decidió:** dueño del proyecto (F-005, puerta 1, D5), por ahora: la elección final se confirma en el panel real

## Contexto
A 1 bit y ~124 ppp la nitidez la decide la letra. Se probaron, en cuatro rondas, más de veinte letras (de contorno, de píxeles y de mapa de bits) con una vista completa y una prueba de tildes.

## Decisión
La letra es parte del **tema**, con una lista por papel. Tema `base`: **DejaVu Sans** para títulos y texto; **Terminus** (mapa de bits, solo en sus tallas) para los detalles (horas, fechas, ids, encabezados), con DejaVu Sans de respaldo. Texto mínimo: 8 pt.

## Consecuencias
Las dos son libres y van en `server/fonts/` con sus licencias. Una letra de mapa de bits en una talla que no trae no se dibuja: el motor nunca la pide así. Cambiar de letra es cambiar el tema.
