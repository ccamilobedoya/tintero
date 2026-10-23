# F-007 · Mejoras de la revisión de F-004

**Estado:** **cerrada** · el dueño aprobó integrar el 2026-10-23 · el dueño pidió estas mejoras el 2026-10-23 (sin decisiones nuevas: todo sale de la revisión de F-004)
**Modelo del programador:** sonnet
**Dependencias nuevas permitidas:** ninguna.

## Listo para programar (se marca antes de pedir aprobación)
- [x] Cada CA se puede comprobar con una prueba, con valores concretos.
- [x] El contrato (interfaces, formatos, errores) está escrito.
- [x] Los archivos a crear o tocar están listados.
- [x] Presupuestos y reglas de seguridad que aplican, nombrados.
- [x] Lo que queda fuera de alcance, escrito.
- [x] Nombres de archivos, rutas, puertos y URLs que las pruebas necesiten, escritos.
- [x] Toda función que se prueba tiene nombre y firma.

## Contexto
El revisor de F-004 aprobó con 4 mejoras y una lección candidata (lecturas de archivos sin tope, tema que se repite desde F-001). Por P2, la lección se vuelve **regla automática**: el arquitecto agregó la regla de semgrep `tintero-lectura-sin-tope` (`tools/semgrep/tintero.yml`, la corre `tools/revisar`). Hoy marca 8 lugares del código del producto; esta ficha los resuelve junto con las 4 mejoras.

## Alcance
1. **Emulador:** leer los PEM de `--ca/--cert/--key` con tope.
2. **Lista de aparatos:** detectar también ediciones con la misma fecha de modificación y el mismo tamaño.
3. **`pki`:** si falla a mitad de la instalación, no dejar archivos sueltos.
4. **Límite de paneles:** documentar que no se poda y por qué está acotado.
5. **Regla de semgrep:** dejar `tools/revisar` sin hallazgos de `tintero-lectura-sin-tope`.

**Fuera de alcance:** la prueba intermitente de F-002 (CA21, simulador en Docker); cambiar la regla de semgrep (es del arquitecto); cualquier otro cambio de comportamiento.

## Requisitos
- R1. Pruebas unitarias junto al código para 1, 2 y 3.
- R2. Fuera de lo que dice el *Contrato*, nada cambia de comportamiento: las pruebas de aceptación de F-001 a F-004 siguen pasando.

## Contrato

### 1 · PEM del emulador con tope
- Tope **64 KiB** por archivo (el mismo que usa el servidor para sus PEM).
- La CLI lee los tres archivos **al arrancar**, antes de cualquier petición. Si uno no se puede leer, no es un archivo regular o pasa del tope → sale con **2**, con un mensaje que nombra la opción (`--ca`, `--cert` o `--key`) y **sin** conectarse.
- `emulator/src/http.ts` no usa lecturas sin tope (ni `readFileSync` ni `readFile`).
- El emulador **no** importa código de `server/` (son piezas separadas): la lectura con tope es propia del emulador.

### 2 · Recarga de la lista de aparatos
- La firma que decide si se relee la lista pasa a ser `mtimeMs`, `ctimeMs`, `size` e `ino` (antes: `mtimeMs` y `size`).

### 3 · Instalación de `pki` sin restos
```ts
// server/scripts/pki.ts
export function installFiles(files: { from: string; to: string; mode: number }[]): Promise<void>;
```
- Copia cada `from` a su `to` (creación exclusiva, con su `mode`). Si **cualquiera** falla, borra los `to` que ya instaló en esa llamada y rechaza con el error original.
- `pkiInit`, `pkiServer` y `pkiDevice` instalan con `installFiles`. Después de un fallo, un reintento con los mismos argumentos funciona.

### 4 · Límite de paneles documentado
- Comentario en `server/src/app.ts` y una línea en `server/README.md`: el conteo de paneles por aparato empieza al arrancar el servidor, no se poda, y está acotado por (aparatos listados) × `--max-panels`.

### 5 · Regla `tintero-lectura-sin-tope`
Los 8 lugares que marca hoy:

| Archivo | Qué hacer |
|---------|-----------|
| `emulator/src/http.ts` (×3) | Se arregla con el punto 1 (sin `nosemgrep`) |
| `emulator/src/storage.ts:49` | Lectura con tope de verdad (no `stat` y después leer), o `nosemgrep` con el motivo |
| `server/scripts/pki.ts` (×2) | Archivos que el propio programa acaba de generar en su carpeta temporal privada: `nosemgrep` con el motivo, o evitar la lectura |
| `contract/scripts/schema.ts:52`, `contract/scripts/serve.ts:18` | Archivos del propio repo: `nosemgrep` con el motivo |

Formato del marcador: `// nosemgrep: tintero-lectura-sin-tope -- <motivo>`, en la línea anterior a la lectura.

## Criterios de aceptación
Las pruebas crean sus archivos en `os.tmpdir()` y los borran al terminar.

- **CA1.** Emulador por la CLI con `--server https://localhost:9` (nada escucha ahí) y un `--cert` de **65 537 bytes** → sale con **2**, el mensaje contiene `--cert`, y sale en menos de 2 s (no intentó conectarse). Igual con un `--ca` que no existe (mensaje con `--ca`) y con un `--key` que es una carpeta (mensaje con `--key`).
- **CA2.** En `emulator/src/http.ts` no aparecen `readFileSync` ni `readFile`.
- **CA3.** Servidor con TLS y la lista con `p1`: se reemplaza el contenido de la lista por otro **del mismo tamaño** que no lista a `p1` (otra huella de 64 caracteres) y se le devuelve con `utimesSync` la misma fecha de modificación de antes → la siguiente petición de `p1` responde **404 vacío**.
- **CA4.** `installFiles` con dos archivos donde el `from` del segundo no existe → rechaza, y **ninguno** de los dos `to` existe después. Con los dos `from` válidos, instala ambos con sus modos.
- **CA5.** `server/README.md` dice que el conteo de paneles por aparato no se poda y que está acotado por aparatos listados × `--max-panels`.
- **CA6.** `tools/revisar --base main` no tiene hallazgos de `tintero-lectura-sin-tope`, y en `emulator/src/http.ts` no hay ningún `nosemgrep`. Todo `nosemgrep: tintero-lectura-sin-tope` del repo lleva un motivo después de `--`.
- **CA7.** Las pruebas de aceptación de F-001 a F-004 siguen pasando.

## Presupuestos
Sin cambios.

## Seguridad
- [ ] Toda entrada externa con límite de tamaño antes de parsear (es el objetivo de la ficha).
- [ ] Servicios locales solo en 127.0.0.1 (sin cambios).
- [ ] Dependencias nuevas: ninguna.

## Archivos
- A tocar: `emulator/src/{cli,http,storage}.ts`, `server/src/{devices,app}.ts`, `server/scripts/pki.ts`, `server/README.md`, `contract/scripts/{schema,serve}.ts`, y sus `*.test.ts`. Si hace falta, un archivo nuevo en `emulator/src/` para la lectura con tope.
- Del arquitecto (ya hecho, va con la ficha): `tools/semgrep/tintero.yml`, `tools/revisar`, `tools/README.md`, `CLAUDE.md`.

## Resultado esperado
`tools/revisar` vuelve a estar limpio con la regla nueva activa, y las 4 mejoras de la revisión de F-004 quedan hechas.

## Terminado (se marca al cerrar)
- [x] Todos los CA pasan en la verificación (informes en `docs/informes/F-007/`).
- [x] `tools/revisar` limpio con la regla nueva (salida 3 por `contract/scripts/`: revisor en modo juicio, aprobado).
- [x] `tools/check-scope` limpio para cada rol.
- [x] Resultado obtenido y resumen para aprobar escritos; métricas y lecciones se actualizan al integrar.
- [x] El dueño aprobó integrar (2026-10-23).

---

## Resultado obtenido (2026-10-23)

**Qué se hizo:** lectura con tope propia del emulador (`emulator/src/capped.ts`, 64 KiB, con `fstat` sobre el descriptor abierto); la CLI lee los PEM al arrancar y sale con 2 nombrando la opción; la memoria *flash* del emulador lee con tope de verdad (antes: `stat` y luego leer). Firma de recarga de la lista `mtimeMs:ctimeMs:size:ino`. `installFiles` en `pki`: crea cada destino exclusivo **y con su modo en el mismo momento**, y al fallar borra lo instalado en la llamada y el destino a medias (nunca uno que ya existía). Conteo de paneles documentado. La regla `tintero-lectura-sin-tope` queda sin hallazgos: 4 lecturas resueltas con tope y 4 marcadas con motivo (archivos del repo o recién generados por el propio programa).

| CA | Resultado |
|----|-----------|
| CA1–CA7 | ✅ PASAN (11 pruebas de aceptación de F-007; F-001 a F-004: 256; 205 unitarias) |

**Vueltas:** pruebas 1 · programación 2 (la vuelta 2 hizo las 2 mejoras del revisor sobre llaves privadas: modo al crear y destino a medias; el arquitecto decidió no dejarlas para después) · verificación 2 (en la 1 el verificador corrigió su prueba de CA3: `utimesSync` pierde los submilisegundos) · revisión 2 (juicio aprobado con 2 mejoras; confirmación aprobada).

**Mejoras anotadas:** ninguna pendiente.

**Costo de agentes:** USD 1,22 en 14 corridas (programador 0,66 · verificador 0,41 · revisor 0,14 · integrador 0,02). Verificador de pruebas y programador corrieron **en paralelo** (carpetas separadas; ninguno ve lo del otro).

## Resumen para aprobar

**Qué cambió:** quedan hechas las 4 mejoras de la revisión de F-004 (certificados del emulador leídos con tope, lista de aparatos que detecta cualquier edición, `pki` sin restos y con las llaves creadas ya con 600, límite de paneles documentado) y la lección de las lecturas sin tope es ahora una **regla de semgrep** que bloquea en `tools/revisar`.

**Criterios:** 7 de 7 · vueltas: verificación 2, revisión 2

**Revisión:** aprobada, sin mejoras pendientes · zonas sensibles: `contract/scripts/schema.ts` y `serve.ts` (solo marcadores `nosemgrep` con motivo)
**Dependencias nuevas:** ninguna

**Riesgos o pendientes:** la prueba de F-002 CA21 (simulador en Docker) sigue fallando a veces con todo el lote; pasa sola.

**Decisión que se pide:** integrar `ver/F-007` a `main`. **Aprobado (dueño, 2026-10-23).**
