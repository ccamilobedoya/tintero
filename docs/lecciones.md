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
| 2026-10-22 | F-001 (integrador) | `check-scope` comparaba contra la punta de `main`: un *commit* nuevo en `main` aparecía como cambio del verificador | Comparar contra el punto donde la rama salió de la base (`git merge-base`) | `tools/lib/git.ts` |
| 2026-10-22 | F-001 (integrador) | El hook exigía compilar todo y bloqueó las pruebas de la fase 1, que por diseño importan código que aún no existe | Las pruebas de aceptación se compilan con `tests/acceptance/tsconfig.json`: los hooks las saltan en la fase de pruebas y `tools/revisar` las compila en la verificación | `tools/git-hooks/pre-commit`, `tools/revisar` |
| 2026-10-22 | F-001 (programador) | Una corrida se cortó por el límite de uso de la cuenta y el lanzador la mostró como un resultado normal; el programador no pudo borrar su archivo de prueba (`rm` no permitido) | `lanzar-agente` marca `is_error` y sale con código 1; el programador tiene `rm` (`check-scope` detecta borrados fuera de alcance) | `tools/lanzar-agente` |
| 2026-10-22 | F-001 (verificador) | En la fase de verificación, `check-scope verificador --base main` siempre falla: la rama `ver` ya trae el código del programador | En esa fase se comprueba con `--base HEAD` (solo los cambios del verificador) | `docs/PROCESO.md` |
| 2026-10-22 | F-001 (verificador) | Aclarar la ficha después de escribir las pruebas dejó una prueba desalineada (la corrigió el verificador, sin debilitarla) | Si una aclaración toca un CA ya probado, avisar al verificador en la fase de verificación | `docs/PROCESO.md` (práctica) |
| 2026-10-22 | F-001 (revisor) | Las pruebas de aceptación no pasaban tipos ni lint (primera vez que se compilan) | El verificador las deja limpias en la verificación (`tsc -p tests/acceptance`, `eslint`); los hallazgos de `tests/acceptance/` vuelven a él | agente verificador, `docs/PROCESO.md` |
| 2026-10-22 | F-001 (revisor) | semgrep marca `http://127.0.0.1` en pruebas vivas | Excepción documentada: una constante por archivo con `nosemgrep` justificado | `docs/seguridad.md` |
| 2026-10-22 | F-001 (revisor) | El resumen agrupaba hallazgos de archivos distintos bajo uno solo | Agrupar por herramienta, regla y archivo | `tools/lib/review-summary.ts` |
| 2026-10-22 | F-001 (revisar) | La excepción de loopback con `nosemgrep` en la constante no funcionó: semgrep sigue la URL hasta cada `fetch` | Una función auxiliar por archivo con el único `fetch` marcado, que solo acepta `http://127.0.0.1:` | `docs/seguridad.md` |
