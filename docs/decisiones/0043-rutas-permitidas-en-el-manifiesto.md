# ADR-0043 · El manifiesto declara las rutas que usa la integración

- **Estado:** aceptada
- **Fecha:** 2026-10-24 · **Decidió:** dueño del proyecto (F-009, puerta 1, D12)

## Contexto
Un token ETAPI de Trilium no tiene alcances: puede todo, incluso borrar notas (verificado en TriliumNext 0.106). `writes` en el manifiesto y `allowWrite` en la configuración (ADR-0040) no bastan para limitar qué se toca.

## Decisión
El manifiesto declara además los **métodos y prefijos de ruta** que usa la integración (`trilium-tareas`: `GET /notes`, `PATCH /attributes/`). El cliente vigilado rechaza cualquier otra petición **sin llamar**. Tintero usa un token **propio**, revocable (S4).

## Consecuencias
Una integración con un error no puede borrar ni crear notas. Ampliar las rutas es cambiar el manifiesto, y eso se revisa (I3). Aplica a las integraciones siguientes.
