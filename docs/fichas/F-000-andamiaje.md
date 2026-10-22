# F-000 · Andamiaje del repositorio

**Estado:** **cerrada** · el dueño aprobó integrar el 2026-10-21
**Programa:** el **arquitecto**, como excepción de arranque (el ciclo necesita que esto exista). Al final lo revisa un **verificador nuevo** y se corre la prueba de regresión de los agentes (P8).

## Contexto

Ya están decididos: el ciclo de desarrollo (doc. 8), las mejoras **P1–P10**, **M1**, **M2** y **M4**, y la base técnica: **TypeScript sobre Node 24 con npm** y sus protecciones (doc. 4). Esta ficha deja el repositorio listo para que F-001 corra el ciclo completo.

## Alcance

### 1. Repositorio y estructura
Git local, rama `main`. **Sin GitHub y sin licencia** por ahora.

```
server/              servidor (vacío)
emulator/            emulador de pantalla (vacío)
firmware/            lo escribe el dueño (solo un README)
docs/
  fichas/            fichas + PLANTILLA.md (con «listo para programar» y «terminado», P10)
  decisiones/        ADR (M1): plantilla + las decisiones ya tomadas
  plantillas/        informes con formato fijo (P3) y resumen para el celular (P4)
  lecciones.md       hallazgos repetidos y en qué regla se convirtieron (P2)
  metricas.md        vueltas y hallazgos por ficha (P7, se llena desde F-001)
  MAPA.md            mapa del repo, generado (P6)
tests/
  acceptance/        pruebas del verificador
  agents/            ficha de juguete para la regresión de los agentes (P8)
tools/               revisar, check-scope, publicar-ficha, mapa
.claude/
  agents/            programador, verificador, revisor
  settings.json      permisos y hooks (P5)
CLAUDE.md            convenciones cortas para todos los agentes
package.json, package-lock.json, .npmrc, .nvmrc, tsconfig.json, eslint.config.*
```

**Idioma (aprobado):** código e identificadores en **inglés**; fichas, ADR y documentación en **español**.

### 2. Node y npm con protecciones
- `.nvmrc` = 24 y `engines` en `package.json` (Node 24); `engine-strict=true`.
- `.npmrc`: `ignore-scripts=true` (sin scripts de instalación), `save-exact=true` (versiones exactas), `fund=false`.
- Instalar **siempre** con `npm ci` (desde el archivo de bloqueo).
- `revisar` corre `npm audit`, `npm audit signatures` (firmas del registro) y `osv-scanner`, y **señala toda dependencia nueva** como zona sensible: el revisor la mira y aparece en el resumen para el dueño.
- Regla en `CLAUDE.md`: una dependencia nueva se justifica en la ficha.

### 3. TypeScript y calidad
- `tsconfig` en modo **estricto**.
- `eslint` con `typescript-eslint` (reglas con tipos) y reglas de seguridad; `prettier` para el formato.
- Pruebas con **Vitest** (aprobado; Stryker lo soporta para P9). Stryker se configura cuando haya código en zonas sensibles.

### 4. `tools/revisar` (herramientas primero)
Corre sobre el cambio y deja un **resumen de menos de 40 líneas** (herramienta, archivo, regla, severidad) y marca **zonas sensibles** (`tools/sensitive-paths.txt`, dependencias nuevas incluidas):

| Herramienta | Dónde corre |
|-------------|-------------|
| `tsc --noEmit`, `eslint`, `prettier --check`, `knip` (código y dependencias sin uso), `vitest` | npm (devDependencies) |
| `npm audit`, `npm audit signatures` | npm |
| `semgrep`, `gitleaks`, `osv-scanner` | Docker, imágenes fijadas por *digest* |
| `trivy`, `hadolint` | Docker, cuando haya Dockerfile |

Código de salida distinto de cero si hay algo bloqueante.

### 5. Controles deterministas (P5)
- **`tools/check-scope <rol>`**: compara lo que cambió en git con lo permitido para cada rol y **rechaza** lo demás. Programador: no toca `docs/fichas/`, `docs/decisiones/` ni `tests/acceptance/`. Verificador: solo `tests/acceptance/`. Revisor: nada.
- **Hooks de Claude Code** (`.claude/settings.json`): formatear con `prettier` después de cada edición; **nadie lee `.env*`** ni `~/.config/` (regla de permisos).
- **Hook de git antes de cada *commit***: `gitleaks` sobre lo que se va a guardar, `eslint` y `tsc`.

### 6. Agentes (`.claude/agents/`, los mantiene el arquitecto)
- **`programador`** (Sonnet; Haiku si la ficha es *mecánica*): recibe la ficha, `CLAUDE.md` y `MAPA.md`; entrega código, pruebas unitarias e informe con formato fijo. **No ve** las pruebas de aceptación.
- **`verificador`** (Sonnet): recibe **solo la ficha**. **Primero** escribe las pruebas de aceptación (P1) y avisa si un criterio no se puede probar (ficha ambigua → vuelve al arquitecto). Después de que el programador termina, las corre y entrega su informe.
- **`revisor`** (sin escritura): entra solo si `revisar` lo pide; Haiku resume, Sonnet juzga zonas sensibles.

### 7. Documentos y publicación
- **ADR (M1)**: plantilla y **un ADR por cada decisión ya tomada** (las de la tabla *Decisiones técnicas* del índice). Los escribe el arquitecto.
- **`tools/publicar-ficha`**: copia una ficha (con su resumen para el celular) a Trilium, bajo *Fichas*; la encuentra por la etiqueta `#ficha=F-NNN` y la **actualiza sin duplicar**. Lee el token de `~/.config/trilium/env`; nunca lo copia.
- **`tools/mapa`**: regenera `docs/MAPA.md` desde la primera línea del README de cada carpeta.

### 8. Regresión de los agentes (P8)
`tests/agents/` trae una **ficha de juguete** (F-999) con **una ambigüedad** y una función con **un error plantado**, y el procedimiento para correr el ciclo sobre ella. Se corre al cerrar F-000 y cada vez que el arquitecto cambie un agente.

**Fuera de alcance:** código del servidor, del emulador y del firmware; GitHub; integración continua; licencia; Stryker; datos sintéticos (M4, llegan con la primera integración).

## Criterios de aceptación

- **CA1.** Existe el repositorio con la estructura de arriba y un primer *commit*; `git status` limpio.
- **CA2.** `npm ci` instala sin correr scripts de instalación; `npm audit signatures` pasa.
- **CA3.** `tools/revisar` sobre el repo recién creado termina **sin hallazgos** en **menos de 2 minutos**.
- **CA4.** En una rama de prueba con **fallas plantadas** (un secreto falso, una variable sin uso, un `eval` con datos de entrada, un error de tipos, una dependencia con una falla conocida, una dependencia nueva), `tools/revisar` **las detecta todas**, marca la dependencia nueva como zona sensible y su resumen ocupa **menos de 40 líneas**. La rama se borra después.
- **CA5.** `tools/check-scope verificador` rechaza un cambio fuera de `tests/acceptance/` y acepta uno adentro; `tools/check-scope programador` rechaza un cambio en `docs/fichas/`.
- **CA6.** El hook de git **impide** un *commit* con un secreto falso.
- **CA7.** Un intento de leer un `.env` desde Claude Code en el repo es **bloqueado** por los permisos.
- **CA8.** `tools/publicar-ficha` crea la nota de F-000 en Trilium; al correrlo otra vez la actualiza y **no hay una segunda nota**.
- **CA9.** Los tres agentes aparecen en Claude Code con su modelo y sus herramientas.
- **CA10.** Corriendo el ciclo sobre la ficha de juguete: el verificador **señala la ambigüedad** antes de que se programe, y el **error plantado no pasa** la verificación.
- **CA11.** Nada pidió `sudo`, nada se publicó en internet y ningún token quedó en el repo.

## Presupuestos

- `tools/revisar` en el repo vacío: **< 2 min** (las imágenes de Docker ya descargadas).
- Resumen de `revisar`: **< 40 líneas**.
- CA10 gasta tokens de verdad (un verificador y un programador en Sonnet sobre una ficha pequeña): se avisa antes de correrlo.

## Seguridad

- El token de Trilium solo se lee de un archivo fuera del repo (permisos 600), indicado en la configuración local.
- `gitleaks` en el hook de git y en `revisar`.
- Imágenes de Docker fijadas por *digest*.
- Nada sale a internet salvo las descargas de npm y de imágenes.

## Resultado esperado

Un repositorio en el que F-001 (contrato del protocolo) puede correr el ciclo completo, con controles que no dependen de que los modelos obedezcan.

---

## Resultado obtenido (2026-10-21)

| CA | Resultado | Evidencia |
|----|-----------|-----------|
| CA1 | ✅ | Estructura completa; *commits* en `main`; `git status` limpio |
| CA2 | ✅ | `npm ci` con `ignore-scripts=true`; 151 paquetes con firma verificada |
| CA3 | ✅ | `tools/revisar` limpio en **45 s** (ver nota sobre el registro de npm) |
| CA4 | ✅ | Las 6 fallas plantadas detectadas; resumen de 26 líneas; rama borrada |
| CA5 | ✅ | `check-scope` acepta y rechaza según el rol (CLI y pruebas unitarias) |
| CA6 | ✅ | El hook de git bloqueó un *commit* con un token falso |
| CA7 | ✅ | Claude Code bloqueó `Read` sobre un `.env` falso; además, hook de Bash (ver nota) |
| CA8 | ✅ | Una sola nota tras publicar dos veces; la creación la cubren pruebas unitarias |
| CA9 | ✅ | Los 3 agentes cargan con su modelo y herramientas |
| CA10 | ✅ | Ficha ambigua → CA1 **NO VERIFICABLE** con la pregunta exacta. Ficha resuelta → verificador nuevo: **CA2 FALLA** (3000 mV → −33 %), CA1 y CA3 pasan, código intacto. Repetido tras corregir el verificador: mismo resultado |
| CA11 | ✅ | Sin `sudo`; nada publicado; gitleaks limpio en árbol e historial |

**Verificador final (agente nuevo, Sonnet, USD 0,21):** confirmó CA1, CA2, CA5, CA7–CA11 en el repo. No pudo reproducir CA4 y CA6 (su lista de comandos no permite crear archivos por Bash ni hacer *commits*) y su corrida de CA3 falló porque `npm audit` se quedó sin red: el resumen lo marcó como «herramienta sin resultado» y **falló cerrado**, como debe. Observaciones atendidas: CA7 solo cubría `Read`; la cabecera de la ficha estaba vieja.

**Revisor (modo juicio, Sonnet, USD 0,105)** sobre los cambios a `tools/`: aprobado con 3 mejoras. Aplicadas: el hook de secretos falla cerrado y es más estricto; sus límites quedaron documentados en `docs/seguridad.md`. La tercera ya estaba cubierta (`.revisar/` excluido en `.gitleaks.toml`).

**Desviaciones y notas**
- Herramientas en **TypeScript que Node 24 corre directo**; `tools/revisar` (bash) las orquesta.
- `@types/node` fijado en **24** (npm instaló 26).
- **Registro de npm lento:** `npm audit` llegó a tardar 212 s y la revisión 147 s. Se paralelizaron las herramientas de red y `npm audit` tiene tiempo máximo; si no responde pero **osv-scanner** sí revisó el archivo de bloqueo, queda como «cubierto» (si fallan los dos, bloquea).
- **Hook de Bash** contra `.env` y `.config`: barrera contra descuidos, no control de seguridad. El control real de los agentes es la lista cerrada de comandos de `tools/lanzar-agente`.
- **Agregados que no estaban en la ficha:** `tools/lanzar-agente` (contexto limpio, tope de gasto, costo por corrida), una nota de estado para retomar en otra sesión (hoy fuera del repo, ADR-0023) y `vitest.acceptance.config.ts`.
- **Lecciones (P2):** 3 hallazgos convertidos en reglas (`docs/lecciones.md`).
- Los últimos cambios a `tools/` aplican lo que pidió el revisor y tienen pruebas; no se volvió a pasar por el revisor para no entrar en un ciclo.
- **Costo total de agentes en F-000: USD 0,57** (6 corridas de verificador, 1 de revisor).

## Terminado
- [x] Todos los CA pasan (informes arriba).
- [x] `tools/revisar` limpio (pide revisor solo porque el cambio toca `tools/`, y el revisor ya lo vio).
- [x] `check-scope` limpio para el verificador.
- [x] Resultado y resumen escritos; métricas y lecciones actualizadas.
- [x] El dueño aprobó integrar (2026-10-21).

## Resumen para aprobar

**Qué cambió:** el repo quedó listo para trabajar con agentes: herramientas de revisión, controles por rol, protecciones de npm y de secretos, agentes, plantillas, ADR y documentación para retomar en otra sesión.

**Criterios:** 11 de 11 pasan · verificador final: confirmó lo que su entorno le dejaba probar · revisión de `tools/`: aprobada con 3 mejoras, aplicadas.

**Dependencias:** solo de desarrollo (TypeScript, eslint, prettier, Vitest, knip), con firmas verificadas.

**Riesgos o pendientes:** el registro de npm a veces es lento (cubierto por osv-scanner); el hook de Bash es una barrera contra descuidos, no un control de seguridad.

**Costo de agentes:** USD 0,57.

**Decisión que se pide:** dar F-000 por cerrada y pasar a redactar F-001 (contrato del protocolo).
