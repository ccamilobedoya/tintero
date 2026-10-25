# F-010 · Servicio mínimo: arranca solo y se reinicia

**Estado:** **aprobada** · el dueño la separó en dos el 2026-10-25 («F-010 con lo mínimo para correr el servidor, F-011 con el resto») y aprobó D1–D3
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna.

## Decisiones

| # | Decisión | Aprobado |
|---|----------|----------|
| **D1** ✅ | Quién mantiene vivo el proceso | Un servicio de **systemd de usuario** (`tintero.service`), con `Restart=always`, `RestartSec=5` y sin tope de reinicios (`StartLimitIntervalSec=0`), habilitado al arrancar la máquina (el usuario ya tiene *linger*: arranca sin sesión abierta). **No hace falta `sudo`**. Descartado: Tintero en un contenedor (necesitaría el *socket* de Docker para lanzar Chromium, que equivale a ser administrador). Plantilla en el repo con marcadores; la ruta real la pone un instalador desde la configuración local (ADR-0023). |
| **D2** ✅ | Docker aún no listo al arrancar | **Sin código nuevo:** el servidor sale con 2 como hoy y systemd lo vuelve a intentar cada 5 s hasta que Docker responde. La espera dentro del proceso, con registros más limpios, va en F-011. |
| **D3** ✅ | Sin restos de un choque | Los contenedores de Chromium llevan la etiqueta `tintero.chromium=1` y la de su **instancia** (`tintero.instance=<nombre>`). Al arrancar, antes de lanzar el suyo, el servidor **borra** los que hayan quedado **de su misma instancia** (con reinicios automáticos, un choque dejaría un Chromium de 512 MB por vuelta). El servicio arranca con `--instance servicio`; quien arranca a mano o una prueba sin `--instance` no borra nada, así nunca mata el Chromium de otro Tintero que esté corriendo. *(Aclaración del 2026-10-25: el programador vio que borrar por la sola etiqueta mataba el Chromium de las pruebas en paralelo y, en la vida real, el del servicio al arrancar otro a mano.)* |

**Pasan a F-011:** esperar a Docker dentro del proceso, relanzar Chromium si su contenedor muere, `--pull never`, salida limpia ante un error fatal, `tools/prueba-recuperacion` y la lista de chequeo del apagón, y las 5 mejoras de la revisión de F-009. **Pasa a F-012:** cómo llega la pantalla al servidor (Funnel, nombre público, CA real).

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos.
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto
El servidor de la casa se apaga a veces (cortes de luz, racionamiento). Hoy Tintero se arranca a mano. Esta ficha lo deja corriendo como servicio que arranca con la máquina y se levanta solo si se cae, con lo mínimo de código: la limpieza de contenedores huérfanos, que los reinicios automáticos hacen necesaria. F-009 ya guarda en disco el estado de la integración (ADR-0044) y no deja promesas sueltas (ADR-0045). Aplica ADR-0031 (Chromium en contenedor endurecido).

## Alcance
Etiqueta y limpieza de contenedores de Chromium; plantilla de la unidad de systemd de usuario e instalador; instrucciones en `server/README.md`; prueba en vivo del servicio.

**Fuera de alcance:** lo que pasa a F-011 y F-012 (arriba); la configuración real del dueño (vistas, datos, integraciones, token), que se arma fuera del repo cuando exista la pantalla (F-012).

## Requisitos
- R1. Arrancar a mano (`npm run server -- …`) sigue igual, salvo la limpieza de huérfanos al arrancar Chromium. Las pruebas de aceptación de F-001 a F-009 pasan.
- R2. El instalador no pide `sudo` ni escribe fuera de `~/.config/systemd/user/`.
- R3. Nada privado en el repo: la plantilla lleva marcadores y las rutas reales vienen de la configuración local (`docs/configuracion-local.md`).

## Contrato

### Chromium (`server/src/engine/chromium.ts`, zona sensible)
```ts
export const CHROMIUM_LABEL = "tintero.chromium=1";
export const INSTANCE_NAME = /^[a-z0-9-]{1,32}$/;
export function removeOrphanChromium(instance: string,
  options?: { log?: (line: Record<string, unknown>) => void }): Promise<number>;
```
- `chromiumDockerArgs(name, port, fontsDir, image, instance?)` agrega `--label`, `tintero.chromium=1` y, si hay `instance`, `--label`, `tintero.instance=<instance>`, todo **antes** de la imagen. Lo demás del contenedor queda igual (ADR-0031). Una `instance` que no case con `INSTANCE_NAME` lanza.
- `removeOrphanChromium(instance)`: `instance` tiene que casar con `INSTANCE_NAME` (si no, lanza sin llamar a `docker`); `docker ps -aq --filter label=tintero.chromium=1 --filter label=tintero.instance=<instance>` (salida limitada como las demás llamadas a `docker`); cada id tiene que ser hexadecimal de 12 a 64 caracteres (si no, lanza sin borrar nada); `docker rm -f <ids…>` en una sola llamada si hay alguno. Devuelve cuántos borró. Si borró alguno, registra `{ ts, event: "chromium", action: "orphans", count }`. Errores de `docker` se lanzan (el servidor sale con 2 y systemd reintenta, D2).
- `startChromium(options?)` gana `instance?` y `log?`. **Con** `instance`: llama `removeOrphanChromium(instance, { log })` antes de lanzar su contenedor y lo etiqueta con esa instancia. **Sin** `instance`: no borra nada (como hoy, más la etiqueta `tintero.chromium=1`).
- **Servidor:** opción `--instance <nombre>` (si no casa con `INSTANCE_NAME`, sale con 2); se pasa a `startChromium`. Con `--chromium` (uno externo) se ignora y no se borra nada.

### Servicio (`deploy/`, lo escribe el arquitecto)
- `deploy/tintero.service.in`: plantilla con `@TINTERO_DIR@`, `@NODE@` y `@ARGS@`:
  `[Unit]` `Description=Tintero`, `StartLimitIntervalSec=0` · `[Service]` `Type=simple`, `WorkingDirectory=@TINTERO_DIR@`, `ExecStart=@NODE@ server/src/main.ts @ARGS@` (el dueño pone `--instance servicio` en `TINTERO_ARGS`), `Restart=always`, `RestartSec=5`, `KillSignal=SIGTERM`, `TimeoutStopSec=45`, `NoNewPrivileges=yes` · `[Install]` `WantedBy=default.target`.
- `tools/instalar-servicio [--dry-run]` (lo escribe el arquitecto): lee `TINTERO_DIR`, `TINTERO_NODE` y `TINTERO_ARGS` de la configuración local (`$TINTERO_LOCAL_ENV` o `~/.config/tintero/local.env`, ≤ 16 KiB); si falta alguna sale con 2 y la nombra; si un valor tiene salto de línea o `@`, sale con 2. Rellena la plantilla, la deja en `~/.config/systemd/user/tintero.service` (600), corre `systemctl --user daemon-reload` y `systemctl --user enable tintero.service`. **No** lo arranca. Con `--dry-run` imprime la unidad y no escribe ni llama a `systemctl`.
- `server/README.md`: instalar, arrancar (`systemctl --user start tintero`), ver registros (`journalctl --user -u tintero`), actualizar (`git pull`, `npm ci`, `systemctl --user restart tintero`), y qué mirar tras reiniciar la máquina.

## Criterios de aceptación
Las pruebas con Docker real usan la imagen fijada de `tools/images.conf` y borran al final todo lo que lanzaron.

- **CA1 (etiqueta).** `chromiumDockerArgs("tintero-chromium-abcd1234", 0, "/tmp/f", "img@sha256:…", "prueba-a")` contiene `--label` seguido de `tintero.chromium=1` y `--label` seguido de `tintero.instance=prueba-a`, todos antes de la imagen; sin el quinto argumento, solo la primera etiqueta; con `"Prueba A"` lanza.
- **CA2 (huérfanos de la misma instancia).** Con cuatro contenedores de la imagen fijada (los lanza la prueba, con instancias de nombre único por corrida, p. ej. `f010-a-<hex>` y `f010-b-<hex>`): dos con `tintero.chromium=1` + instancia A, uno con `tintero.chromium=1` + instancia B y uno sin etiquetas. `removeOrphanChromium(A, { log })` devuelve **2**, los dos de A ya no existen, el de B y el sin etiquetas siguen corriendo, y hay una línea `{ event: "chromium", action: "orphans", count: 2 }`. Otra vez con A → 0 y sin línea. `removeOrphanChromium("Mal Nombre")` lanza.
- **CA3 (arranque limpia solo lo suyo).** Con un contenedor de instancia A y otro de instancia B corriendo: `startChromium({ instance: A })` → hay **exactamente 1** contenedor de A (el nuevo, cuyo nombre devuelve `startChromium`) y el de B sigue corriendo. `startChromium()` sin instancia no borra ninguno. El servidor con `--instance "Mal Nombre"` sale con 2.
- **CA4 (plantilla e instalador).** `tools/instalar-servicio --dry-run` con `TINTERO_LOCAL_ENV` apuntando a un archivo de prueba (`TINTERO_DIR=/srv/t`, `TINTERO_NODE=/usr/bin/node`, `TINTERO_ARGS=--port 8790`) sale con 0 e imprime una unidad con `WorkingDirectory=/srv/t`, `ExecStart=/usr/bin/node server/src/main.ts --port 8790`, `Restart=always`, `RestartSec=5`, `StartLimitIntervalSec=0` y `WantedBy=default.target`, sin dejar ningún marcador `@…@`; no crea `~/.config/systemd/user/tintero.service` si no existía. Sin `TINTERO_DIR` → 2 y el mensaje dice `TINTERO_DIR`. Con un valor con salto de línea → 2.
- **CA5 (regresión).** `npm run test:acceptance` (F-001 a F-009) pasa.
- **CA6 (en vivo, lo corre el arquitecto).** Servicio instalado con los ejemplos de F-006 (`--instance servicio --views config/tablero.views.example.json --data config/tablero.data.example.json`), arrancado: el emulador recibe un índice; `kill -9` del proceso → en ≤ **15 s** el servicio está activo otra vez y el emulador vuelve a recibir un índice; hay **exactamente 1** contenedor de la instancia `servicio`. Resultado en *Resultado obtenido*.
- **CA7 (reinicio real, lo corre el dueño cuando quiera).** Tras reiniciar la máquina, `systemctl --user is-active tintero` da `active` y hay exactamente 1 contenedor con la etiqueta. Resultado en *Resultado obtenido* (si aún no se corrió, se dice).

## Presupuestos
Vuelta tras `kill -9` ≤ 15 s (5 s de systemd + arranque con Chromium).

## Seguridad
- [ ] Entradas externas con **límite de tamaño antes de parsear**: salida de `docker` (como hoy) y configuración local del instalador (≤ 16 KiB).
- [ ] Servicios locales solo en **127.0.0.1** (sin cambios).
- [ ] Dependencias nuevas: ninguna.
- [ ] `docker rm -f` **solo** sobre ids salidos del filtro `label=tintero.chromium=1` + `label=tintero.instance=<instancia>`, validados como hexadecimales; el nombre de instancia validado antes de llamar a `docker`.
- [ ] El instalador no usa `sudo`, escribe solo en `~/.config/systemd/user/` y rechaza saltos de línea (inyección en la unidad).

## Archivos
**A tocar (programador):** `server/src/engine/chromium.ts` (+ prueba), `server/src/args.ts` y `server/src/main.ts` (`--instance`), `server/README.md`.
**Ya escritos por el arquitecto:** `deploy/README.md`, `deploy/tintero.service.in`, `tools/instalar-servicio`, `docs/configuracion-local.md` (claves nuevas).
**Verificador:** `tests/acceptance/F-010/`.

## Resultado esperado
Tintero queda como servicio de usuario: arranca con la máquina, se levanta solo a los 5 s si se cae, espera a Docker reintentando, y no deja Chromium huérfanos.

## Terminado (se marca al cerrar)
- [ ] Todos los CA pasan en la verificación (informe adjunto); CA6 con su resultado en vivo.
- [ ] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [ ] `tools/check-scope` limpio para cada rol.
- [ ] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [ ] El dueño aprobó integrar.

---

## Resultado obtenido
*(Lo llena el arquitecto al cerrar.)*

## Resumen para aprobar
*(Una pantalla, con `docs/plantillas/resumen-aprobacion.md`.)*
