# ADR-0019 · TypeBox para los esquemas del contrato

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-001, puerta 1)

## Contexto
El contrato tiene que servir al servidor, al emulador, al firmware y a terceros.

## Decisión
Esquemas con TypeBox (`typebox` 1.x): son JSON Schema directamente y dan los tipos de TypeScript. Las reglas cruzadas van en validadores propios. Validación con `Value` (sin generar código).

## Consecuencias
Una dependencia (sin dependencias propias). Alternativas descartadas: Zod (su JSON Schema es una conversión con pérdidas), JSON Schema a mano + Ajv, OpenAPI primero.
