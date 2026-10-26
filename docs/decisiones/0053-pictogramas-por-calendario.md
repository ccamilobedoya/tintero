# ADR-0053 · Un pictograma por calendario en la agenda

- **Estado:** aceptada
- **Fecha:** 2026-10-25 · **Decidió:** dueño del proyecto (F-014, D1 y D7)

## Contexto
El dueño ve en la misma pantalla eventos de varios calendarios (casa, personal, trabajo) y quiere distinguirlos de un vistazo, sin color.

## Decisión
Cada calendario lleva un **pictograma** de una lista fija (persona, maletín, casa, pastel, corazón, estrella), dibujado por el motor como SVG de 16 px a 124 ppp, a la izquierda de la hora en el bloque `agenda`. Los **festivos** salen en la agenda con la estrella **solo si el bloque lo pide** (`options.holidays: true`), pensado para la agenda de pantalla completa; en el resumen de «hoy» no salen.

## Consecuencias
Los dibujos están en el código (nada de emojis ni fuentes de símbolos). Un pictograma nuevo es un cambio de código con su prueba. Sin pictogramas en la fuente, la agenda se ve como antes.
