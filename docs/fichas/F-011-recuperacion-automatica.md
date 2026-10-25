# F-011 · Recuperación automática completa

**Estado:** **cerrada** · el dueño aprobó integrar el 2026-10-25 · aprobada: el dueño aprobó D1–D5 el 2026-10-25, al separar F-010 (lo mínimo) de esta ficha (el resto). Se programa después de F-010.
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna.

## Decisiones

| # | Decisión | Aprobado |
|---|----------|----------|
| **D1** ✅ | Esperar en vez de salir | Si Docker no responde al arrancar, el servidor **espera y reintenta** dentro del proceso (1 s, 2 s, 4 s… hasta 60 s entre intentos, sin fin) en vez de salir con 2 y depender de los reinicios de systemd (F-010 D2). Así el registro dice una vez qué espera, no un arranque fallido cada 5 s. **Empieza a escuchar cuando Chromium está listo**: mientras tanto la pantalla no conecta y reintenta en su próximo despertar (no la tenemos despierta esperando un `503`). |
| **D2** ✅ | Chromium que muere se relanza | Si el contenedor de Chromium que arrancó el servidor deja de existir o de responder, el servidor lo **relanza** (con la misma espera creciente) y el `Renderer` se conecta a la dirección nueva. Mientras tanto los dibujos fallan rápido y el motor contesta `503 busy` como siempre. Con `--chromium` (uno externo), solo se reconecta, como hoy. |
| **D3** ✅ | Nada depende de internet | `docker run --pull never`: la imagen fijada por *digest* tiene que estar en la máquina; si no está, el servidor lo dice (`image-missing`, una vez por hora) y sigue esperando, en vez de intentar bajarla sin internet. |
| **D4** ✅ | Un error fatal reinicia limpio | Si aun así ocurre un error sin atrapar (`uncaughtException` o `unhandledRejection`), el servidor registra una línea sin contenido, corre el apagado ordenado (con tope) y sale con **1**: systemd (F-010) lo levanta a los 5 s con estado limpio y el estado de F-009 en disco. |
| **D5** ✅ | Prueba de apagón | `tools/prueba-recuperacion` hace en vivo lo que se puede sin apagar la máquina (matar el proceso con `kill -9`, matar Chromium, parar Trilium) y comprueba que todo vuelve. El **reinicio real** lo hace el dueño (corta la sesión de Claude), con una lista de chequeo en `server/README.md`. |

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] **Nombres de archivos, rutas, puertos y URLs** que las pruebas necesiten, escritos.
- [x] Toda **función que se pruebe tiene nombre y firma**, y todo **contador o medida** dice desde cuándo cuenta.

## Contexto
F-010 deja Tintero como servicio de usuario que arranca con la máquina, se reinicia si se cae y borra los Chromium huérfanos (etiqueta `tintero.chromium=1`). Esta ficha agrega lo que falta para que se recupere **sin reiniciar el proceso**: esperar a Docker, relanzar Chromium, no depender de internet, reiniciar limpio ante un error fatal, y las mejoras de la revisión de F-009. Aplican ADR-0031, ADR-0044, ADR-0045 y la excepción de CDP de `docs/seguridad.md`.

## Alcance
Espera de Docker, relanzamiento de Chromium y `--pull never` en `chromium.ts`; manejo de errores fatales; mejoras de F-009; prueba de recuperación en vivo y lista de chequeo del apagón.

**Fuera de alcance:** F-012 (cómo llega la pantalla al servidor: Funnel, nombre público, CA real); avisos por Telegram (se conectan del lado del homelab, fuera del repo); varias copias del servidor.

## Requisitos
- R1. Sin cambios para quien arranca a mano, salvo que ya no sale con 2 cuando Docker no responde (espera). Las pruebas de aceptación de F-001 a F-010 pasan.
- R3. **Mejora de la revisión de F-010:** `server/README.md` dice que un fallo de `docker ps` en la limpieza aborta el arranque (systemd reintenta) y que dos procesos con la **misma** `--instance` se borrarían el Chromium entre sí (una instancia por nombre).
- R2. **Mejoras de la revisión de F-009** (vuelta 2), en `server/src/integrations/{trilium-tasks,state}.ts`: (1) `persist` libera `saveRunning` en un `finally`; (2) `runCycle` separa los errores de red/HTTP (`IntegrationHttpError`) de los inesperados, y estos se registran **siempre** con `{ ts, integration, event: "defect", where: "cycle" }` (regla 12; sin mensaje ni pila); (3) la línea `pending` de una escritura fallida lleva su `code`; (4) `saveState` abre el temporal con `"wx"` (borrando antes un resto del mismo nombre), sin seguir enlaces; (5) `loadState` lee del mismo descriptor que midió.

## Contrato

### Docker y Chromium (`server/src/engine/chromium.ts`, zona sensible)
```ts
export interface ChromiumService {
  renderer: Renderer;                 // el mismo Renderer de siempre, con la dirección que cambie
  endpoint(): string | undefined;     // la actual; undefined mientras relanza
  stop(): Promise<void>;              // para el contenedor y deja de relanzar
}
export function startChromiumService(options?: {
  log?: (line: Record<string, unknown>) => void;
  clock?: () => Date;
  sleep?: (ms: number) => Promise<void>;   // las pruebas aceleran la espera
  image?: string;                          // por defecto la de tools/images.conf
  instance?: string;                       // la de F-010: con ella, borra antes los huérfanos de esa instancia
}): Promise<ChromiumService>;               // resuelve cuando hay un Chromium que responde
export function waitForDocker(options?: {
  log?: (line: Record<string, unknown>) => void; clock?: () => Date;
  sleep?: (ms: number) => Promise<void>; signal?: AbortSignal;
}): Promise<void>;
```
- **`waitForDocker`**: corre `docker version --format {{.Server.Version}}` (tope 10 s); si falla, espera 1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000… ms y reintenta, sin fin (o hasta `signal`). Registro: `{ ts, event: "docker", ok: false }` al primer fallo y luego una por hora (desde el primero); `{ ts, event: "docker", ok: true, waitedS }` cuando responde tras fallar.
- **`startChromiumService`**: `waitForDocker`; `removeOrphanChromium` (F-010); antes de cada arranque mira la imagen con `docker image inspect <imagen>` (tope 10 s): si no está, no corre `run` y registra `{ event: "chromium", action: "start", ok: false, code: "image-missing" }` **antes** de la primera espera (y luego una vez por hora mientras siga así); si arrancar falla por otra cosa, `code: "start"`. En ambos casos, misma espera creciente.
- **Relanzar** (D2): cuando un dibujo falla y la reconexión de siempre también falla, el servicio mira si el contenedor sigue corriendo (`docker inspect -f {{.State.Running}} <nombre>`, tope 10 s). Si no, lo borra, registra `{ event: "chromium", action: "restart" }` y arranca otro con la espera creciente. Mientras relanza, `render` rechaza enseguida (el motor contesta `busy`). Un solo relanzamiento a la vez.
- `chromiumDockerArgs` agrega `--pull`, `never` antes de la imagen (además de la etiqueta de F-010).

### Servidor (`server/src/main.ts`, `server/src/fatal.ts`)
- Sin `--chromium`: usa `startChromiumService` y **espera** a que resuelva antes de escuchar. Con `--chromium`: como hoy. La línea `{"listening": …}` sale cuando ya escucha; **antes** pueden salir líneas de espera (`docker`, `chromium`), así que ya no es necesariamente la primera (aclaración del 2026-10-25; `server/README.md` lo dice).
- `installFatalHandlers(options: { log, shutdown: () => Promise<void>, exit: (code: number) => void, clock?: () => Date })`: con `uncaughtException` o `unhandledRejection` registra `{ ts, event: "fatal", kind }` (sin mensaje ni pila), llama `shutdown()` con tope de **30 s** y luego `exit(1)`. Solo actúa la primera vez. SIGTERM sigue con el apagado ordenado y sale con 0.

### Prueba y lista de chequeo (las escribe el arquitecto)
- `tools/prueba-recuperacion [--trilium]`: con el servicio de F-010 corriendo, y tope de 60 s por paso, imprime `OK`/`FALLA`: 1) `kill -9` del proceso → `GET /api/v1/index` como el del emulador vuelve a dar 200; 2) `docker kill` del Chromium → exactamente un contenedor `tintero.chromium=1` corriendo y una vista se dibuja bien, **sin** que el proceso se haya reiniciado (mismo PID); 3) con `--trilium`, para y arranca el contenedor de Trilium → aparece una línea `read ok: true` en el registro. Sale con 0 solo si todo dio `OK`.
- `server/README.md`: lista de chequeo del apagón real (tras reiniciar: servicio activo, un solo Chromium, el emulador recibe una vista, la vista de tareas muestra lo guardado y luego lo de Trilium).

## Criterios de aceptación
Las pruebas con Docker real usan la imagen fijada de `tools/images.conf`. «Docker falso» = una carpeta temporal fuera del repo con un ejecutable `docker` que falla (sale con 1) las primeras N veces que lo llaman con `version` (cuenta en un archivo), anota cada llamada en otro archivo, y en lo demás llama al `docker` real (ruta absoluta resuelta antes de cambiar `PATH`); la prueba lo pone primero en el `PATH` del proceso.

- **CA1 (espera a Docker).** Con el Docker falso, N = 3, y `sleep` de prueba que no espera: `waitForDocker` resuelve tras **4** llamadas a `version`; las esperas pedidas fueron 1000, 2000 y 4000 ms; el registro tiene una línea `docker` `ok: false` y una `ok: true`. El servidor real con N = 2 no sale con 2: escribe `{"listening": …}` y contesta.
- **CA2 (Chromium muere).** Con el servidor arrancado y una vista ya dibujada: `docker kill` del contenedor; las peticiones siguientes dan `200` o `503 busy` (nunca otra cosa ni una conexión cortada), y en ≤ **30 s** una vista nueva se dibuja bien, con el mismo proceso. Hay una línea `restart` y, al final, exactamente 1 contenedor con la etiqueta.
- **CA3 (sin bajar imágenes).** `chromiumDockerArgs(...)` contiene `--pull`, `never` antes de la imagen. `startChromiumService({ image: "tintero-imagen-que-no-existe:0", sleep })` con el Docker falso: tras la primera espera hay una línea `{ event: "chromium", action: "start", ok: false, code: "image-missing" }`, y ninguna llamada anotada fue `pull` ni `run` con esa imagen.
- **CA4 (error fatal).** `installFatalHandlers` con `log`, `shutdown` y `exit` falsos: un `unhandledRejection` → una línea con exactamente las claves `ts`, `event` (`"fatal"`) y `kind` (`"unhandledRejection"`); `shutdown` llamado una vez y luego `exit(1)`; un segundo evento no hace nada. Si `shutdown` no termina en 30 s (reloj de prueba), igual `exit(1)`.
- **CA5 (mejoras de F-009).** (1) Con un `saveState` que lanza una vez, el siguiente cambio vuelve a guardar el archivo. (2) Con un `engine.setSource` que lanza, el ciclo deja `{ event: "defect", where: "cycle" }` en **cada** ciclo (tres ciclos seguidos → tres líneas), y no una línea `read ok: false`. (3) Una escritura que falla por red deja `{ event: "write", result: "pending", code: "network" }`. (4) Si `<stateFile>.tmp-<pid>` es un enlace simbólico a otro archivo, `saveState` no escribe en el destino del enlace y el estado queda bien guardado. (5) Las pruebas de estado de F-009 (CA17–CA20, CA23) siguen pasando. *(Que `loadState` lea del mismo descriptor no se observa desde afuera: lo juzga la revisión.)*
- **CA6 (regresión).** `npm run test:acceptance` (F-001 a F-010) pasa.
- **CA7 (en vivo, lo corre el arquitecto).** Con el servicio de F-010 instalado y arrancado, `tools/prueba-recuperacion` sale con 0 (pasos 1 y 2). Resultado en *Resultado obtenido*.
- **CA8 (apagón real, lo corre el dueño).** Tras un reinicio de la máquina, la lista de chequeo de `server/README.md` se cumple. Resultado en *Resultado obtenido* (si aún no se corrió, se dice).

## Vuelta 2 · huecos de recuperación hallados en la revisión (2026-10-25)

La vuelta 1 cumplió CA1–CA6 y la revisión no tuvo bloqueantes, pero cuatro de sus mejoras son huecos de lo que el dueño pidió (que el servidor se recupere solo), así que se arreglan antes de integrar. Lo de arriba sigue valiendo salvo donde se dice **reemplaza**.

- R4. **Relanzar nunca queda muerto en silencio:** si el relanzamiento falla por algo inesperado, se registra `{ ts, event: "defect", where: "chromium-restart" }` (sin mensaje ni pila) y el siguiente dibujo que falle vuelve a intentar relanzar (el estado no queda trabado). Ningún `.catch(() => undefined)` en el camino del relanzamiento, salvo al cerrar un contenedor o conexión vieja, con comentario de por qué.
- R5. **Espera también entre relanzamientos seguidos:** si Chromium muere otra vez antes de 60 s desde el último relanzamiento, la espera creciente sigue (no vuelve a cero): un Chromium que muere al nacer se reintenta a 1 s, 2 s, 4 s… hasta 60 s. La espera vuelve a cero tras 60 s de funcionar bien.
- R6. **Sin restos de un `docker run` fallido:** si `docker run` falla o se pasa de tiempo, se hace `docker rm -f <nombre>` del contenedor propio (con o sin instancia) antes de reintentar.
- R7. **Vivo pero sordo también se relanza** (**reemplaza** «mira si el contenedor sigue corriendo»): cuando un dibujo falla y la reconexión también falla, el servicio relanza **siempre**: borra su contenedor (`docker rm -f <nombre>`, esté corriendo o no) y arranca otro. Un Chromium vivo con el CDP roto ya no deja la pantalla sin dibujar.
- Nota (no se arregla): `renderer.close()` durante un arranque deja una conexión abierta hasta `stop()`; un SIGTERM y un error fatal a la vez pueden correr el apagado dos veces (sin efecto práctico).

**Criterios nuevos:**
- **CA9 (vivo pero sordo).** Con el servidor arrancado (instancia propia de la prueba, `--port 0`) y una vista dibujada: `docker pause` de su contenedor; las peticiones siguientes dan `200` o `503 busy`, y en ≤ **45 s** una vista nueva se dibuja bien con el **mismo proceso**; al final hay exactamente 1 contenedor de esa instancia, distinto del pausado, y el pausado ya no existe. Hay una línea `restart`.
- **CA10 (sin restos de un `run` fallido).** Con el Docker falso haciendo que `run` falle (sale con 1 tras crear el contenedor, o tarda más que el tope), tras dos intentos fallidos no queda **ningún** contenedor con el nombre de esos intentos, y el Docker falso registró un `rm -f <nombre>` por cada uno.

## Presupuestos
Recuperación tras la muerte de Chromium ≤ 30 s sin reiniciar el proceso; espera entre intentos ≤ 60 s; un registro de fallo por hora como mucho mientras dure una caída (salvo `defect`, que es siempre).

## Seguridad
- [ ] Entradas externas con **límite de tamaño antes de parsear**: salida de `docker` (como hoy).
- [ ] Servicios locales solo en **127.0.0.1** (sin cambios).
- [ ] Dependencias nuevas: ninguna.
- [ ] El contenedor de Chromium sigue con todo el endurecimiento de ADR-0031; `--pull never` no baja nada; `docker rm -f` solo sobre el contenedor propio o etiquetado.
- [ ] Los registros de error fatal y de `defect` no llevan mensajes ni pilas.

## Archivos
**A crear:** `server/src/fatal.ts` (+ prueba), `tests/acceptance/F-011/`.
**A tocar:** `server/src/engine/chromium.ts` (zona sensible), `server/src/main.ts`, `server/src/integrations/{trilium-tasks,state}.ts` (+ pruebas), `server/README.md`.
**El arquitecto:** `tools/prueba-recuperacion`.

## Resultado esperado
Tintero espera a Docker sin rendirse, relanza Chromium si muere sin reiniciar el proceso, no necesita internet, y si algo raro lo tumba, vuelve en 5 s con lo que tenía guardado.

## Terminado (se marca al cerrar)
- [x] Todos los CA pasan en la verificación (informe adjunto); CA7 y CA8 con su resultado en vivo.
- [x] `tools/revisar` limpio, o hallazgos resueltos o anotados como mejora.
- [x] `tools/check-scope` limpio para cada rol.
- [x] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones actualizadas.
- [x] El dueño aprobó integrar (2026-10-25).

---

## Resultado obtenido
- **Vuelta 1** (pruebas y código en paralelo): espera de Docker, `startChromiumService` con relanzamiento, `--pull never`, `fatal.ts`, mejoras de F-009 (R2) y la nota de F-010 (R3). Verificación **CUMPLE CA1–CA6**; tres aclaraciones de la ficha (línea `listening`, `image-missing` antes de la primera espera, `instance` en el servicio). La revisión, sin bloqueantes, mostró **cuatro huecos de recuperación** (relanzar podía quedar trabado sin aviso, sin espera entre relanzamientos seguidos, restos de un `run` fallido, Chromium vivo pero sordo sin relanzar): como van contra lo que pidió el dueño, se hicieron **vuelta 2** (R4–R7, CA9, CA10) en vez de anotarlos.
- **Vuelta 2:** CA10 pasó; **CA9 falló 4 de 4**: con Chromium congelado (`docker pause`) el servidor nunca volvía a dibujar. **Causa:** al vencer un dibujo, el camino de error esperaba `context.close()` **sin tope** antes de avisar, y contra un Chromium congelado ese cierre no vuelve. El defecto venía de F-005 (también lo tenía el servicio real).
- **Vuelta 3:** todos los cierres del `Renderer` con tope de 2 s (`closeBounded`) y sin `defect` falso al detener. Verificación **CUMPLE CA1–CA6, CA9 (3 de 3 corridas) y CA10**; lote completo 487/487, 392 unitarias. Revisión: **aprobado**, una mejora menor (fijar con una prueba el cierre sin esperar del `Renderer` viejo).
- **CA7 en vivo (2026-10-25, arquitecto, servicio real con el código de esta rama):** `tools/prueba-recuperacion` → **OK** `kill -9` (systemd lo relanzó; vuelve a entregar vistas, borró 1 huérfano) y **OK** `docker kill` de Chromium (el **mismo proceso** lo relanzó y volvió a dibujar; antes de F-011 este paso daba FALLA). Además, `docker pause` del Chromium del servicio: el mismo proceso lo reemplazó y volvió a dibujar **en 23 s**, sin relanzamientos en bucle.
- **Limpieza:** dos Chromium huérfanos de pruebas de hace 21 h (de antes de las etiquetas, 512 MB de tope cada uno) se borraron a mano; desde F-010 ya no pueden quedar sin etiqueta.
- **Intermitencia:** F-005 CA27 (`busy`) falló una vez con todo el lote en paralelo (segunda vez desde F-006); pasa solo. Queda anotada (regla 12).
- **CA8 (apagón real):** pendiente; lo corre el dueño cuando quiera (lista en `server/README.md`).
- **Costo:** USD 3,01 (programador 1,39 · verificador 1,28 · revisor 0,31 · integrador 0,03).

## Resumen para aprobar

## Para aprobar · F-011 · Recuperación automática completa

**Qué cambió:** el servidor espera a Docker en vez de salir, **relanza Chromium si muere o se congela sin reiniciarse** (medido: 23 s con Chromium congelado), no baja imágenes de internet, y ante un error fatal sale limpio para que systemd lo levante. Más las mejoras de F-009.

**Criterios:** 8 de 8 automáticos + CA7 en vivo · vueltas: verificación 3 (CA9 falló en la 2: cierres sin tope, defecto que venía de F-005), revisión 3

**Revisión:** aprobado, 1 mejora menor · zonas sensibles: `chromium.ts`
**Dependencias nuevas:** ninguna

**Riesgos o pendientes:** CA8 (reiniciar la máquina) cuando quieras; F-005 CA27 a veces falla con carga.

**Decisión que se pide:** integrar a `main` (aprobado el 2026-10-25).
