# ADR-0015 · TypeScript sobre Node 24, Vitest; código en inglés

- **Estado:** aceptada
- **Fecha:** 2026-10-21 · **Decidió:** dueño del proyecto

## Contexto
El ESP32 no depende del lenguaje del servidor. El dueño domina Node.

## Decisión
TypeScript estricto sobre Node 24; pruebas con Vitest; código e identificadores en inglés, documentación en español.

## Consecuencias
Un mismo esquema sirve para servidor, emulador y web (contrato versionado). Framework web, base de datos y empaque se deciden en la ficha que los use.
