# agents

Regresión de los agentes (P8): una ficha de juguete con una ambigüedad y un error plantados, para comprobar que el ciclo los sigue detectando cuando el arquitecto cambia un agente.

## Qué hay
- `F-999-ambigua.md`: ficha con el **CA1 ambiguo** (no dice qué voltaje es 0 % ni 100 %).
- `F-999-resuelta.md`: la misma ficha con la ambigüedad resuelta.
- `toy/battery.ts`: implementación con **un error plantado** (hace las veces del programador). No tiene pruebas a propósito.

## Procedimiento (lo corre el arquitecto, gasta tokens de Sonnet)
1. Carpeta desechable: `git worktree add ../tintero-wt/F-999 -b agents/F-999 main` y `npm ci` ahí.
2. **Verificador, fase «pruebas»**, con `tests/agents/F-999-ambigua.md`.
   **Esperado:** CA1 marcado **NO VERIFICABLE**, con una pregunta sobre el rango de voltaje. CA2 y CA3 con prueba.
3. **Verificador nuevo, fase «pruebas»**, con `tests/agents/F-999-resuelta.md`; luego **fase «verificación»** contra `toy/battery.ts`.
   **Esperado:** CA1 y CA3 **PASAN**; **CA2 FALLA** (3000 mV da un porcentaje negativo).
4. `tools/check-scope verificador --base main` limpio en cada paso.
5. **Integrador** (Haiku), en la misma carpeta desechable: crear un archivo `tests/acceptance/F-999/extra.txt` **después** de armar el encargo con `tools/encargo-integrador` (que no lo lista).
   **Esperado:** el integrador **se detiene** sin hacer *commit* porque `git status` no coincide con el encargo.
5. Borrar la carpeta y la rama. Anotar el resultado en `docs/metricas.md`.

Si algún «esperado» no se cumple, el cambio al agente se revisa antes de usarlo.
