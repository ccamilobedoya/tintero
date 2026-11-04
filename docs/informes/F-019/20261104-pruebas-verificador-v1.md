## Informe del verificador — F-019 · fase pruebas

**Veredicto: PRUEBAS LISTAS.** Ningún CA queda NO VERIFICABLE. Hoy las pruebas fallan por lo esperado: las fuentes nuevas no existen. Hay una limitación importante abajo: no pude compilar el C++.

**Qué corrí**
- `npx tsc --noEmit -p tests/acceptance`: solo falla el módulo `contract/src/packbits.ts`, que aún no existe.
- `npx eslint tests/acceptance/F-019`: lo único que queda son errores `no-unsafe-call` sobre `unpackBits`, que el programador resuelve al crear el módulo.
- `prettier` aplicado y `tools/check-scope verificador --base main` limpio. No hice *commit*.
- `npm run test:acceptance -- tests/acceptance/F-019`, sin `firmware.test.ts`:
  - `native.test.ts` sale 3 por falta de `firmware/src/http_reader.cpp`.
  - `packbits.test.ts` y `server.test.ts` no cargan por el módulo ausente.
  - `contract.test.ts` y `emulator.test.ts` fallan donde la ficha cambia el comportamiento.
  - `fixtures.test.ts` pasa.

**Mapa CA → prueba** (en `tests/acceptance/F-019/`)
- **CA1–CA10** más plazos con `millis()` que da la vuelta y nombres de `Outcome`: `native/reader.cpp`, con `fakes.h` y `mini.h`.
- **CA11**: `native/packbits.cpp` con `fixtures/{hoy,agenda,tablero,blank,noise}.{raw1,pb1}`.
- **CA15–CA16**: `native/recovery.cpp`. **CA17–CA18**: `native/tolerance.cpp`.
- `native.test.ts` lanza `tools/probar-firmware` y muestra cada prueba C++ como un caso de Vitest.
- **CA12**: `packbits.test.ts`. **CA13** y **CA19**: `server.test.ts`. **R8** (contrato): `contract.test.ts`. **CA14**: `emulator.test.ts`.
- **CA20** y **CA21**: `firmware.test.ts`.
- **CA22**: del dueño en el panel real (A3). No lleva prueba automática, no es NO VERIFICABLE.

**Decisiones que tomé**
- Los `.raw1` los dibujó Chromium real una sola vez y quedaron guardados. Si faltan, `fixtures.test.ts` los regenera. El `.pb1` sale de mi codificador (`refEncode`, según R8). `hoy.pb1` mide 12 098 bytes. `tablero` viene de `config/hoy.views.example.json`.
- CA13 y CA14 usan el motor real con un dibujante falso (con patrón o con ruido) y el servidor en proceso, sin Chromium.
- CA19 usa un `Engine` falso con 16 vistas, porque el motor real no produce ese caso. Si el programador guarda `pb1` dentro de `RenderedView`, ese falso podría necesitar un campo más.
- "Una vez por dibujo" lo probé así: dos pedidos del mismo índice dejan exactamente una línea con `index-trimmed` en la salida del servidor. El formato del aviso no está en la ficha; solo exijo que contenga `index-trimmed` y cuántas vistas se quitaron.

**Limitaciones**
- **No pude compilar mis `.cpp`.** Docker directo y `cp`/`mv` en el repo pedían aprobación, y `probar-firmware` sale 3 sin las fuentes. Los revisé a mano contra `-Wall -Wextra -Werror`. Si el programador encuentra un error de compilación mío, es una falla de mi prueba. Queda la verificación real en la fase siguiente.
- CA20 y CA21 miran cosas distintas. CA21 falla hoy (sin `pb1,raw1`, `http_reader.h` ni watchdog). CA20 pasaría hoy con el firmware actual, porque RAM y flash ya están bajo los topes. Lo que obliga a cambiar es CA21.
- R12, segunda mitad (recorte de zonas, `zones-trimmed`): no tiene CA y no se puede alcanzar con ids válidos (unos 3,5 KB con 48 zonas). No la probé.
- Cualquier aserción que la ficha no fija (por ejemplo, qué pasa con un `act` desconocido y geometría mala) quedó fuera a propósito.

--- verificador · costo USD 2.186 · turnos 112 · tokens entrada 122 (+caché 6282498) salida 87370 · success
