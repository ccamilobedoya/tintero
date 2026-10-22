# Lecciones (P2)

Hallazgos que se repitieron y en qué regla automática se convirtieron. Así el revisor con modelo trabaja cada vez menos.

| Fecha | Ficha | Hallazgo repetido | Regla nueva | Dónde |
|-------|-------|-------------------|-------------|-------|
| 2026-10-21 | F-000 (CA10) | El comando documentado para correr las pruebas de aceptación de una ficha no funcionaba (Vitest las excluye) | Configuración propia `vitest.acceptance.config.ts` y comando único `npm run test:acceptance -- tests/acceptance/F-NNN` | `CLAUDE.md`, agente verificador |
| 2026-10-21 | F-000 (CA10) | En la fase «pruebas» el verificador dio «CUMPLE», veredicto que es de la fase «verificación» | Veredictos separados por fase | Plantilla del informe, agente verificador |
| 2026-10-21 | F-000 (revisor) | Un hook de bloqueo fallaba abierto ante una entrada ilegible | Regla en `CLAUDE.md`: los hooks de bloqueo fallan cerrado; prueba unitaria de `decide` | `CLAUDE.md`, `tools/hooks/block-secrets.ts` |
| 2026-10-22 | ADR-0023 (revisor) | Un control omitido en silencio se mostraba como ✅ | Todo control que no corre se reporta «–» (omitido), nunca ✅ | `tools/revisar` |
| 2026-10-22 | ADR-0022 (revisor) | Permisos por prefijo esquivables con flags (`--no-verify`, `--force` al final, refspecs `+`/`:`) | El hook revisa cada comando git por palabras: `forbiddenGit` con pruebas | `tools/hooks/block-secrets.ts` |
| 2026-10-22 | ADR-0022 (integrador) | El control de git bloqueó un push normal: leía como refspec un `:` de otro comando de la misma línea (`; echo "EXIT: $?"`) | `forbiddenGit` analiza cada comando simple por separado e ignora redirecciones y comentarios; pruebas con esos casos | `tools/hooks/block-secrets.ts` |
