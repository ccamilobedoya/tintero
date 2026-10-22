# ADR-0016 · npm con protecciones

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
El ecosistema npm tiene más incidentes de paquetes maliciosos.

## Decisión
`npm ci` siempre; `ignore-scripts`, `save-exact`, `engine-strict`; `npm audit`, `npm audit signatures` y `osv-scanner` en cada revisión; pocas dependencias y cada una nueva justificada en la ficha y marcada como zona sensible.

## Consecuencias
Algunos paquetes que dependen de scripts de instalación necesitarán una excepción explícita.
