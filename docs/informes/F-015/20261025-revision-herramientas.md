## Revisión · F-015 · herramientas

**Resultado:** `tools/revisar --base main` en `ver/F-015` (2026-10-25 22:35): **LIMPIO**, salida 0, sin modelo.

Herramientas: tsc, eslint, prettier, vitest, knip, npm-audit, npm-signatures, semgrep, gitleaks, gitleaks-history, osv-scanner y privacidad en verde; hadolint y trivy omitidas (sin Dockerfile). Los hallazgos listados son los avisos `security/detect-*` de `tests/acceptance` que ya estaban (mejora anotada de F-006), más uno nuevo en `tests/acceptance/F-015/properties.test.ts`.
