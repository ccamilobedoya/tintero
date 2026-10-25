## Informe del revisor · F-010 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (2)

Revisé `git diff main -- server/ deploy/ tools/`. El diff solo toca `server/`. `deploy/tintero.service.in` y `tools/instalar-servicio` (con `tools/lib/install-service.ts`) ya están en main, así que los revisé como están. No ejecuté nada, solo leí el código.

**Bloqueantes**
- Ninguno.

**Verificado**
- **`docker rm -f`**:
  - Solo recibe ids de `docker ps -aq` filtrado por `label=tintero.chromium=1` **y** `label=tintero.instance=<nombre>` (`chromium.ts:164-174`).
  - Docker combina con AND dos filtros `label`, así que deben cumplirse las dos etiquetas.
  - `parseContainerIds` exige hex de 12 a 64 caracteres por línea y lanza error con cualquier otra cosa. Un id inválido aborta antes de `rm`.
  - `execFile` va sin shell, con `maxBuffer` y tiempo de espera.
- **Nombre de instancia**:
  - `INSTANCE_NAME = /^[a-z0-9-]{1,32}$/` se valida en tres puntos: `args.ts` (error de uso), `assertInstance` al inicio de `removeOrphanChromium` y `assertInstance` en `chromiumDockerArgs`.
  - Ninguno de los tres llega a `docker` antes de validar.
  - Los caracteres permitidos no permiten inyectar argumentos. Además va como valor de `--label` en un solo elemento de la lista de argumentos.
  - Un nombre con `-` inicial como `-x` pasa la expresión regular, pero queda dentro de `label=tintero.instance=-x`, así que no se interpreta como opción.
- **Sin `--instance`**: `startChromium` no llama a `removeOrphanChromium`. No se borra nada y el contenedor lleva solo la etiqueta `tintero.chromium=1`.
- **Endurecimiento ADR-0031**: no cambia. Siguen `--read-only`, `--cap-drop ALL`, `no-new-privileges`, `--memory 512m`, `--pids-limit 256`, el `-p` en 127.0.0.1, el montaje de fuentes en solo lectura y el `tmpfs`. El diff solo añade las etiquetas.
- **Plantilla**: `NoNewPrivileges=yes`, `Restart=always`, `RestartSec=5`, `StartLimitIntervalSec=0`, `WantedBy=default.target`. No usa `User=` ni privilegios.
- **Instalador**:
  - Lee el `local.env` como texto y nunca lo ejecuta; el límite es 16 KiB.
  - Rechaza `\r`, `\n`, `\0` y `@` en los valores. Con eso no se pueden inyectar líneas ni marcadores, y falla si queda algún `@X@` sin rellenar.
  - Escribe la unidad con modo 600, y `chmod` explícito después.
  - Solo ejecuta `systemctl --user daemon-reload` y `enable`, con `execFileSync` sin shell.
  - No usa `sudo` ni arranca el servicio.
  - `--dry-run` no escribe nada.
  - Rechaza cualquier argumento que no sea `--dry-run`.

**Mejoras** (se anotan en la ficha)
1. `tools/lib/install-service.ts:28`: la unidad de systemd interpreta `%` (por ejemplo `%h`, `%n`) y `$` en `ExecStart`. Un `TINTERO_ARGS` con esos caracteres se expande de forma inesperada. No es una inyección, porque los valores los pone el dueño. Se corrige rechazando `%` y `$` en los valores, o duplicando `%` como `%%`.
2. `chromium.ts:261-264`: si falla `docker ps` durante la limpieza de huérfanos, `startChromium` aborta. Es coherente con fallar cerrado y con el arranque con `Restart=always`. Conviene dejarlo escrito en la ficha o en `server/README.md`. Con la misma instancia, dos procesos simultáneos se borrarían el Chromium entre sí. Está implícito en el diseño de una sola instancia por nombre y vale la pena documentarlo.

**Lecciones candidatas**
- Los hallazgos de `eslint` en `tests/acceptance/**` (`detect-non-literal-fs-filename` y `detect-object-injection`) vienen de antes de F-010 y no son de este diff. Se repiten en muchas fichas. Una regla (o un `override` acotado a `tests/acceptance` en `eslint.config.js`) los evitaría. Cambiar esa configuración no debe apagar controles en el código de producción.

