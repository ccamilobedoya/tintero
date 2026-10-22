# Proceso: de la ficha a `main`

> Aprobado por el dueño el 2026-10-21 (ADR-0012, ADR-0017); commits y push por fase con el agente **integrador** (Haiku) desde el 2026-10-22 (ADR-0022). Lo ejecuta el **arquitecto** (sesión principal), que **no** hace *commits* ni *push*. Hay **dos puertas del dueño**: la ficha y la integración.

Carpetas de trabajo (*worktrees*), fuera del repo: `../tintero-wt/F-NNN-{acc,dev,ver}`. Cada una con `npm ci`.

**Lanzar un agente:** `tools/lanzar-agente <rol> <modelo> <carpeta> <encargo.md> [tope-usd]` (contexto limpio, tope de gasto, costo y tokens en `.agentes/`).

**Al final de cada fase** el arquitecto lanza al **integrador** (Haiku) con un encargo de 4–6 líneas: carpeta, rama, fase, rol a comprobar, resumen, si se sube. El integrador hace *commit* y `git push -u origin <rama>`. Los informes de los agentes quedan en `.agentes/` durante el ciclo y el arquitecto los consolida en `docs/informes/F-NNN/` **al cierre** (así no rompen el control de alcance de cada rol).

## 0 · Ficha
1. Escribir `docs/fichas/F-NNN-<nombre>.md` desde `PLANTILLA.md` y marcar **Listo para programar**.
2. `tools/publicar-ficha docs/fichas/F-NNN-….md` → el dueño la lee en Trilium.
3. **Puerta 1:** el dueño aprueba. Estado `aprobada`.
4. **Integrador** en `main`, fase `ficha`, con push.

## 1 · Pruebas primero (P1)
1. `git worktree add ../tintero-wt/F-NNN-acc -b acc/F-NNN main`
2. **Verificador**, fase «pruebas», en esa carpeta. Solo recibe la ruta de la ficha.
3. Si marca algún CA **NO VERIFICABLE** → la ficha vuelve al arquitecto; si el cambio es de fondo, otra vez a la puerta 1.
4. **Integrador** en `acc/F-NNN`, fase `pruebas`, rol `verificador`, con push.

## 2 · Programar
1. `git worktree add ../tintero-wt/F-NNN-dev -b dev/F-NNN main` (sin las pruebas de aceptación).
2. **Programador** con el modelo que diga la ficha. Recibe la ficha y, en vueltas siguientes, solo el informe de lo que falló.
3. **Integrador** en `dev/F-NNN`, fase `código`, rol `programador`, con push.

## 3 · Verificar
1. `git worktree add ../tintero-wt/F-NNN-ver -b ver/F-NNN dev/F-NNN`; el **integrador** une `acc/F-NNN` (`merge --no-ff`).
2. **Verificador nuevo**, fase «verificación». No recibe nada del programador.
3. **Integrador** en `ver/F-NNN`, fase `verificación` (informe), con push.
4. **NO CUMPLE** → informe al programador (vuelta +1) → volver a 2; luego el integrador vuelve a unir `dev/F-NNN` en `ver/F-NNN`.
5. **3 vueltas sin cumplir → se detiene.** El arquitecto revisa si la ficha está mal.

## 4 · Revisar (herramientas primero)
En la carpeta `ver`: `tools/revisar --base main`.
- Salida **0** (limpio) → sin modelo, sigue a 5.
- Salida **1** (bloqueante) → **revisor** modo «hallazgos» con **Haiku** → informe al programador → volver a 2 (y luego a 3: el código cambió).
- Salida **3** (zona sensible o dependencia nueva) → **revisor** modo «juicio» con **Sonnet**.
- **Integrador** en `ver/F-NNN`, fase `revisión` (informe), con push.

## 5 · Cierre
1. El arquitecto lee los informes (no todo el código), llena **Resultado obtenido** y **Resumen para aprobar**, y publica la ficha.
2. **Puerta 2:** el dueño aprueba integrar.
3. **Integrador:** une `ver/F-NNN` en `main` (`merge --no-ff`, fase `cierre`) y sube `main`.
4. El arquitecto borra los *worktrees*; actualiza `docs/metricas.md`, `docs/lecciones.md` y la nota de estado (fuera del repo); `tools/mapa`; **integrador** fase `proceso` en `main`, con push.

## Regresión de los agentes (P8)
Cada vez que el arquitecto cambie un `.claude/agents/*.md`: correr `tests/agents/` (ver su README) y confirmar el resultado esperado.
