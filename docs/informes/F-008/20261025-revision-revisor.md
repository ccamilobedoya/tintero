## Informe del revisor · F-008 · modo juicio · vuelta 1

**Veredicto:** APROBADO CON MEJORAS (3)

Las herramientas están limpias. Los avisos de eslint son de `tests/acceptance` de fichas anteriores y ya existían. No ejecuté las pruebas: revisé el `git diff main` y `.revisar/resumen.md`.

**Bloqueantes** (vuelven al programador)
- Ninguno.

**Compatibilidad de protocolo v1**
- `focus` en `zones` es opcional, y el esquema no pone `additionalProperties:false`. Los clientes y servidores v1 anteriores siguen siendo válidos.
- `Tintero-View` también es opcional. Un dispositivo que no lo envía recibe el comportamiento anterior.
- El cambio que sí aprieta el contrato es `validateZones`. Ahora rechaza zonas con `x` o `w` que no sean múltiplo de 8 (`unaligned`) y `focus.pad < focus.ring` (`focus_pad`). Está cubierto con fixtures válidas e inválidas. El motor y `views.ts` ya emiten zonas alineadas, así que no choca con el propio servidor.

**Límites de tamaño y entrada externa**
- `Tintero-View` se valida con `^[a-z0-9_-]{1,16}$` antes de usarse. Un valor fuera del patrón da 400 con el nombre de la cabecera.
- Un id bien formado pero desconocido no rompe nada. El motor lo ignora y responde con la primera vista (`requested` queda `undefined`).
- `parseDataFile` mantiene los topes de tamaño y de fuentes (1 a 16). Solo permite cero fuentes si ninguna ranura usa una, es decir, con `calibration`.
- `calibration` con `source` falla con "this block takes no source". El acceso a `sources[...]` sigue protegido con `hasOwn`.

**Registros**
- Los registros nuevos (`zone-unaligned`, `focus-band-ink`) llevan solo el id de la vista y un conteo. No filtran textos de tareas ni de eventos.

**Lógica del motor**
- `full_refresh` es true en la primera respuesta de cada día local por dispositivo, y el estado se guarda en `DeviceState.fullDay`. Tras reiniciar el servidor, la primera respuesta lo da otra vez. Es inocuo: solo hace un refresco lento de más.
- La vista mostrada se encola primero, pero la respuesta conserva el orden configurado. No añade trabajo en paralelo ni espera nueva.
- Si el `x` o el `w` de una caja no cuadra con el alineado, la zona se descarta, se registra y no se publica. Falla cerrado.
- `checkFocusBand` trabaja por bytes y acotado al panel, sin asignaciones grandes.

**Emulador**
- Envía `Tintero-View` desde el estado guardado en flash. Si ese estado estuviera corrupto, el servidor lo rechazaría con 400. Es un caso límite del estado local del emulador.

**Mejoras** (se anotan en la ficha)
- Documentar en `contract/README.md` que `unaligned` y `focus_pad` endurecen la validación v1 de las zonas. Un servidor v1 anterior con zonas sin alinear ya no pasaría la validación del cliente.
- El emulador podría descartar un `current` guardado que no cumpla el patrón de id antes de enviarlo como `Tintero-View`. Así no tendría un 400 permanente.
- `fullDay` solo vive en memoria. Anotar en la ficha que el primer despertar tras reiniciar el servidor siempre pide refresco lento.

**Lecciones candidatas** (hallazgo repetido → regla automática)
- Los avisos de eslint `detect-non-literal-fs-filename` y `detect-object-injection` se repiten en `tests/acceptance` (F-001, F-002, F-004, F-007). Propongo una configuración de eslint propia para `tests/**` que los desactive solo ahí, con justificación, o un helper único con el `eslint-disable` marcado. Así el resumen deja de tener ruido que tape hallazgos reales.
