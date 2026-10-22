# ADR-0012 · Flujo de desarrollo con agentes

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
Programar con modelos más baratos sin perder calidad.

## Decisión
Ficha → puerta 1 (el dueño) → pruebas del verificador → programador (Sonnet; Haiku si es mecánica) → verificador sin contexto → `tools/revisar` (herramientas primero; Haiku/Sonnet solo interpretan) → puerta 2 (el dueño). Escalamiento a las 3 vueltas. Los `.md` de agentes y del proceso los mantiene el arquitecto.

## Consecuencias
Ver `docs/PROCESO.md`.
