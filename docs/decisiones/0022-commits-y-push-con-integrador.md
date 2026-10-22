# ADR-0022 · Commits y push por fase con el agente integrador

- **Estado:** aceptada
- **Fecha:** 2026-10-22 · **Decidió:** dueño del proyecto

## Contexto
El dueño quiere un *commit* y un *push* por cada fase del ciclo, hechos por un modelo que gaste menos que el arquitecto.

## Decisión
- Un agente **integrador** (Haiku) hace todos los *commits*, uniones y *push*, con formato fijo (`F-NNN <fase>: …`). El arquitecto, el programador y el verificador no hacen *commits*.
- Solo el integrador puede hacer *push* (lo impone `tools/lanzar-agente`); nadie hace `--force`, `reset` ni `rebase`.
- Hooks de git: `pre-commit` y `commit-msg` (secretos y términos privados), `pre-push` (gitleaks y términos privados sobre toda la historia).
- Los informes de los agentes quedan en `docs/informes/F-NNN/` como trazabilidad.

## Consecuencias
Cada fase queda en GitHub. El repositorio es público: ver ADR-0023.
