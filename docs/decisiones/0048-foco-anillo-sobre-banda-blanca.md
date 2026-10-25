# ADR-0048 · Foco: anillo punteado de 3 px sobre una banda blanca, zonas alineadas a 8 px

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-008, D1 y D2)

## Contexto
El ESP32 dibuja el foco con refresco parcial (ADR-0006). El controlador del panel trabaja la ventana parcial por bytes (x y ancho en múltiplos de 8), y el marco invertido de 3 px tocaba casillas, etiquetas y rayas: las zonas empezaban justo donde empieza el contenido. Invertir la zona entera se descartó porque cambia el sentido de las casillas (una tarea hecha se ve pendiente) y de la etiqueta de vencida.

## Decisión
El foco es un **anillo punteado** (tramos de 8 px) **de `focusRing` (0,6 mm, 3 px a 124 ppp)** que el aparato **invierte** en el borde de la zona, por dentro; mientras manda una acción, el anillo es **sólido** («Enviando»). El dueño eligió el punteado al ver las dos variantes. El servidor garantiza que cada zona tiene **x y ancho múltiplos de 8** y una **banda de `focusPad` (1,2 mm, 6 px) en blanco** por dentro de su borde, y lo comprueba después de cada dibujo. Las filas con zona miden **6,2 mm (30 px)**. La respuesta de zonas dice `focus: { ring, pad, dash }`.

## Consecuencias
El anillo nunca toca contenido y quitarlo es volver a invertir. Caben menos filas: en `hoy`, *Por hacer* muestra 5 tareas en vez de 7. Cambian las coordenadas que fijaban F-005 y F-006 (F-008 las reemplaza). Al despertar y al cambiar de vista no hay foco.
