# ADR-0009 · Integraciones: la integración pide, el núcleo concede

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto (idea principal; detalle pendiente)

## Contexto
Conectar servicios nuevos sin fricción y sin perder seguridad.

## Decisión
Cada integración declara en un manifiesto qué entrega, qué permisos y qué hosts necesita; el núcleo guarda las llaves, hace las llamadas y aplica I1–I11 (`docs/seguridad.md`). Los bloques de la vista dependen del tipo de dato, no de la integración.

## Consecuencias
Falta detallar el modelo completo antes de la primera integración.
