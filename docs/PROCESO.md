# Proceso: de la ficha a `main`

> Aprobado por el dueño el 2026-10-21 (ADR-0012, ADR-0017); commits y push por fase con el agente **integrador** (Haiku) desde el 2026-10-22 (ADR-0022). Lo ejecuta el **arquitecto** (sesión principal), que **no** hace *commits* ni *push*. Hay **dos puertas del dueño**: la ficha y la integración.

Carpetas de trabajo (*worktrees*), fuera del repo: `../tintero-wt/F-NNN-{acc,dev,ver}`. Cada una con `npm ci`.

**Lanzar un agente:** `tools/lanzar-agente <rol> <modelo> <carpeta> <encargo.md> [tope-usd]` (contexto limpio, tope de gasto, costo y tokens en `.agentes/`).

**Al final de cada fase** el arquitecto arma el encargo con **`tools/encargo-integrador`** (lista exacta de archivos, primera línea ≤ 72 caracteres) y lanza al **integrador** (Haiku). El integrador hace *commit* y `git push -u origin <rama>`. Los informes de los agentes quedan en `.agentes/` durante el ciclo y el arquitecto los consolida en `docs/informes/F-NNN/` **al cierre** (así no rompen el control de alcance de cada rol).

## Reglas del arquitecto al orquestar (lecciones de F-000 y F-001)
1. **Encargos al integrador solo con `tools/encargo-integrador`**: nunca escritos a mano (se olvidaban archivos o pasaban de 72 caracteres).
2. **Lo que un agente necesita va primero a su rama:** si el arquitecto cambia una regla, excepción o herramienta que el agente va a usar, el integrador la guarda en `main` y la une a la rama de trabajo **antes** de lanzar al agente.
3. **Aclaraciones de la ficha:** si después de la fase 1 se aclara un CA, el encargo de la verificación lo dice explícitamente («el CA-N se aclaró: …»).
4. **Dependencias:** si un commit (o un merge) trae `package-lock.json`, el hook corre `npm ci` antes de compilar. Al crear una carpeta de trabajo, `npm ci` como siempre.
5. **Esperar agentes:** cada `tools/lanzar-agente` en primer plano, o en una tarea en segundo plano propia (con su aviso). **Nunca** bucles con `pgrep -f` (se encuentran a sí mismos).
8. **Cadenas de comandos:** siempre con `set -eo pipefail`, y **nunca** pasar la salida de `tools/lanzar-agente` por un *pipe* sin `pipefail` (`| sed`, `| head`): el *pipe* tapa el código 3 de DETENIDO y la cadena sigue (pasó al cerrar F-003). **Conflictos de merge:** si el integrador se detiene por un conflicto, el arquitecto lo resuelve (solo uniones mecánicas; si toca lógica, vuelve al programador) y el integrador completa el merge.
6. **Si un agente termina con error** (`is_error`, p. ej. el límite de uso de la cuenta): revisar qué dejó a medias en su carpeta, esperar a que se reinicie el límite y relanzarlo con una nota de lo que ya existe.
7. **Encargos con datos concretos:** nombres de archivos, rutas, puertos y URLs que las pruebas necesiten van en la ficha, no se dejan a criterio del agente.
9. **Lo que abre algo a internet** (Funnel, puertos públicos) no lo corre el arquitecto (el modo automático lo bloquea, y está bien): lo prepara en un script con limpieza al salir (`trap`) y lo corre el dueño.
10. **Encargo del programador:** además de las comprobaciones de siempre, `npm run test:acceptance` (las pruebas de las fichas anteriores están en su rama). En F-004 un cambio de texto rompió las de F-003.
11. **`main` es una copia compartida** (otras sesiones pueden tener ahí borradores): los encargos en `main` van con `tools/encargo-integrador --solo <ruta>` (lo de esta fase), y el arquitecto **lee la lista** del encargo antes de lanzar al integrador.

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
3. **Integrador** en `ver/F-NNN`, fase `verificación`, rol `verificador` con **`--base HEAD`** (la rama ya trae el código del programador: solo se revisa lo que cambió el verificador), con push.
4. **NO CUMPLE** → informe al programador (vuelta +1) → volver a 2; luego el integrador vuelve a unir `dev/F-NNN` en `ver/F-NNN`.
5. **3 vueltas sin cumplir → se detiene.** El arquitecto revisa si la ficha está mal.

## 4 · Revisar (herramientas primero)
En la carpeta `ver`: `tools/revisar --base main`.
- Salida **0** (limpio) → sin modelo, sigue a 5.
- Salida **1** (bloqueante) → **revisor** modo «hallazgos» con **Haiku**, separando por dueño → lo de `tests/acceptance/` vuelve al **verificador** (en la rama `ver`) y lo demás al **programador** (en `dev`, luego el integrador une `dev` en `ver` y se vuelve a 3: el código cambió).
- Salida **3** (zona sensible o dependencia nueva) → **revisor** modo «juicio» con **Sonnet**.
- **Integrador** en `ver/F-NNN`, fase `revisión` (informe), con push.

## 5 · Cierre
1. El arquitecto lee los informes (no todo el código), llena **Resultado obtenido** y **Resumen para aprobar**, y publica la ficha.
2. **Puerta 2:** el dueño aprueba integrar.
3. **Integrador:** une `ver/F-NNN` en `main` (`merge --no-ff`, fase `cierre`) y sube `main`.
4. El arquitecto borra los *worktrees*; actualiza `docs/metricas.md`, `docs/lecciones.md` y la nota de estado (fuera del repo); `tools/mapa`; **integrador** fase `proceso` en `main`, con push.

## Regresión de los agentes (P8)
Cada vez que el arquitecto cambie un `.claude/agents/*.md`: correr `tests/agents/` (ver su README) y confirmar el resultado esperado.
