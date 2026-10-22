# ADR-0021 · OpenAPI 3.1 con Swagger UI y simulador Prism

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto (F-001, puerta 1)

## Contexto
El dueño quiere ver y probar el contrato como con Swagger, y probar su firmware antes de que exista el servidor.

## Decisión
El OpenAPI 3.1 se genera desde los mismos esquemas (`contract/openapi/v1.json`); visor Swagger UI y simulador Prism por Docker, solo en `127.0.0.1`. La documentación nunca se expone por Funnel.

## Consecuencias
Que la pantalla real alcance el simulador (necesita HTTPS) se decide cuando el dueño empiece el firmware.
