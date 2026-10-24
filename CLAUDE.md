# Tintero

Servidor que prepara lo que muestran pantallas e-ink con ESP32 (to-do, calendario, Jira…). El ESP32 solo descarga y vuelca imágenes; **el servidor dibuja**. El diseño completo vive en Trilium (nota *Tintero — servidor de pantallas e-ink*); aquí están las decisiones que obligan (`docs/decisiones/`) y las fichas (`docs/fichas/`).

## Si eres la sesión principal (arquitecto)
El estado del proyecto, los próximos pasos y el contexto privado **no están en el repo** (ADR-0023): están en la base de conocimiento del dueño (Trilium), nota **«Tintero — Estado y contexto privado»**; se lee con el MCP `trilium` y se mantiene al día allí. Cómo lanzar agentes: `docs/PROCESO.md`.
- **Nada personal, de infraestructura ni secreto en el repo** (ADR-0023). Si hace falta una referencia privada, va a esa nota; si aparece un término privado nuevo, se agrega a la lista local de términos (`docs/configuracion-local.md`).

## Reglas para todos
- **La ficha manda.** Se programa lo que dice una ficha aprobada por el dueño, nada más. Si algo no cuadra, se detiene y se reporta.
- **Los ADR obligan** (`docs/decisiones/`). Las reglas de seguridad están en `docs/seguridad.md`.
- **Idioma:** código, identificadores y nombres de archivo de código en **inglés**; fichas, ADR, informes y documentación en **español**.
- **TypeScript estricto sobre Node 24.** Node corre `.ts` directamente; no hay paso de compilación para las herramientas.
- **npm con protecciones:** instalar con `npm ci`; nunca `npm install <paquete>` sin que la ficha lo permita. Toda dependencia nueva se justifica y la revisión la marca.
- **Nada de secretos** en el código, en los registros ni en las pruebas. No leer `.env*` ni `~/.config/`.
- **Commits y push los hace solo el agente `integrador`** (Haiku), al final de cada fase. Nadie más (ni el arquitecto) hace *commit* ni *push*. Nunca `--force`, `reset` ni `rebase`; nunca `npm publish`.
- Los hooks y herramientas de bloqueo **fallan cerrado**: ante cualquier error o entrada inesperada, bloquean.
- **Toda entrada externa** (red, archivos, cabeceras, salida de procesos) se limita en tamaño **antes** de parsearla o procesarla (bloqueante de seguridad en F-001); las lecturas de archivos las vigila la regla de semgrep `tintero-lectura-sin-tope` (`tools/semgrep/`).
- **HTTP a 127.0.0.1 en pruebas:** solo a través de una función auxiliar con el único `fetch` marcado (`docs/seguridad.md`).
- **Sin archivos temporales** en el repo: lo que crees para probar, bórralo antes de entregar.
- **Trabajo de fondo sobre un recurso compartido** (p. ej. el `Renderer`): la prioridad vive en el recurso, el trabajo de fondo cede el paso al principal y se cancela en `close()` (lección de F-005).

## Orientarse sin explorar
- `docs/MAPA.md`: qué hay en cada carpeta (se regenera con `tools/mapa`).
- `docs/PROCESO.md`: el ciclo ficha → pruebas → código → verificación → revisión → integración.
- `docs/plantillas/`: formatos fijos de los informes.

## Comandos
```bash
npm ci                         # instalar (desde el archivo de bloqueo, sin scripts)
npm run typecheck              # tsc estricto
npm run lint                   # eslint con reglas de seguridad
npm test                       # pruebas unitarias (Vitest), *.test.ts junto al código
npm run format:check           # prettier
npm run test:acceptance -- tests/acceptance/F-NNN   # pruebas de aceptación de una ficha
tools/revisar [--base main]    # revisión con todas las herramientas → .revisar/resumen.md
tools/check-scope <rol> --base main     # ¿el rol cambió solo lo que le toca?
```

## Quién toca qué (lo verifica `tools/check-scope`)
- **Programador:** código y pruebas unitarias. No toca `docs/fichas/`, `docs/decisiones/`, `docs/plantillas/`, `tests/acceptance/`, `tests/agents/`, `tools/`, `.claude/`, `CLAUDE.md`.
- **Verificador:** solo `tests/acceptance/`.
- **Revisor:** nada.
- **Arquitecto** (sesión principal): fichas, ADR, informes, agentes, herramientas y este archivo (los escribe; el integrador los guarda).
- **Integrador:** solo git (commit, merge, push); no cambia archivos.
