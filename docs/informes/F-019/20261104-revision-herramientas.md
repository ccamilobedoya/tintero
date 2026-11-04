# Revisión · 2026-11-04 14:49 · base `main`

**❌ BLOQUEANTE: 11 hallazgo(s)**

Herramientas: tsc ✅ · eslint ✅ · prettier ✅ · vitest ✅ · knip ✅ · npm-audit ❌10 · npm-signatures ✅ · semgrep ✅ · gitleaks ✅ · gitleaks-history ✅ · osv-scanner ❌1 · hadolint – · trivy – · privacidad ✅ · publicacion ✅ · nunca ✅ · trufflehog ✅ · trufflehog-history ✅

## Hallazgos
- ❌ **npm audit** @eslint/config-array (moderate) — package-lock.json
- ❌ **npm audit** @eslint/js (moderate) — package-lock.json
- ❌ **npm audit** @typescript-eslint/eslint-plugin (moderate) — package-lock.json
- ❌ **npm audit** @typescript-eslint/parser (moderate) — package-lock.json
- ❌ **npm audit** @typescript-eslint/type-utils (moderate) — package-lock.json
- ❌ **npm audit** @typescript-eslint/typescript-estree (moderate) — package-lock.json
- ❌ **npm audit** @typescript-eslint/utils (moderate) — package-lock.json
- ❌ **npm audit** eslint (moderate) — package-lock.json
- ❌ **npm audit** minimatch (moderate) — package-lock.json
- ❌ **npm audit** typescript-eslint (moderate) — package-lock.json
- ❌ **osv-scanner** minimatch: GHSA-g3hv-75wg-m249 — package-lock.json
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-001/artifacts.test.ts:33 (×5)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-002/contract.test.ts:77
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/helpers.ts:22 (×2)
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/keys.test.ts:188
- … y 65 grupos más (ver `.revisar/`)

## Cambios: 62 archivo(s)
- Zonas sensibles: `contract/fixtures/v1/valid/index-pb1.json`, `contract/openapi/v1.json`, `contract/schema/v1/index.schema.json`, `contract/src/index.ts`, `contract/src/openapi.ts`, `contract/src/packbits.test.ts` … y 4 más
- Omitidas: hadolint (sin Dockerfile), trivy (sin Dockerfile)
