# Revisión · 2026-10-26 16:56 · base `main`

**⚠️ LIMPIO, PERO REQUIERE REVISOR (zona sensible o dependencia nueva)**

Herramientas: tsc ✅ · eslint ✅ · prettier ✅ · vitest ✅ · knip ✅ · npm-audit ✅ · npm-signatures ✅ · semgrep ✅ · gitleaks ✅ · gitleaks-history ✅ · osv-scanner ✅ · hadolint – · trivy – · privacidad ✅ · publicacion ✅ · nunca ✅ · trufflehog ✅ · trufflehog-history ✅

## Hallazgos
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-001/artifacts.test.ts:33 (×5)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-002/contract.test.ts:77
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/helpers.ts:22 (×2)
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/keys.test.ts:188
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/testserver.ts:33 (×4)
- · **eslint** security/detect-object-injection — tests/acceptance/F-002/wake.test.ts:269 (×2)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-004/cycle.test.ts:23 (×7)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-004/helpers.ts:73 (×3)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-004/limits.test.ts:23
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-004/pki.test.ts:24 (×18)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-004/tls.test.ts:20
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-007/devices-reload.test.ts:67 (×10)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-007/docs-and-scan.test.ts:9 (×5)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-007/emulator-pem.test.ts:11 (×4)
- · **eslint** security/detect-non-literal-fs-filename — tests/acceptance/F-007/pki-install.test.ts:18 (×7)
- … y 49 grupos más (ver `.revisar/`)

## Cambios: 125 archivo(s)
- Zonas sensibles: `CLAUDE.md`, `package.json`, `tools/README.md`, `tools/git-hooks/pre-commit`, `tools/imagenes-guia`, `tools/images.conf` … y 11 más
- Omitidas: hadolint (sin Dockerfile), trivy (sin Dockerfile)
