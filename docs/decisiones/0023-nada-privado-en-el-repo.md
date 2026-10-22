# ADR-0023 · Nada personal, de infraestructura ni secreto en el repo

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto

## Contexto
El repositorio es público.

## Decisión
- En el repo **nunca** va información personal ni de infraestructura (nombres, servidores, direcciones, IDs de notas, rutas locales), ni llaves, ni nada generado con ellas.
- Lo personal y el estado del proyecto viven en la base de conocimiento privada del dueño (Trilium) y se leen desde allí.
- Para llaves y configuración local: en el repo solo **instrucciones** y ejemplos con valores de relleno (`docs/configuracion-local.md`, `config/local.env.example`); los valores reales, fuera.
- Control automático: una lista privada de términos, **fuera del repo**, que revisan los hooks de git (`pre-commit`, `commit-msg`, `pre-push`) y `tools/revisar`. Se reporta solo archivo y línea, nunca el término.
- La historia local previa se reescribió en un solo *commit* limpio antes del primer *push*.

## Consecuencias
Un colaborador externo no tiene la lista privada: el control le avisa y no bloquea. Lo privado se mantiene a mano en Trilium.
