# Contrato del protocolo v1 (esquemas, validadores, JSON Schema, OpenAPI y simulador)

Contrato versionado entre el servidor, el emulador y el firmware (F-001). Los esquemas se escriben una sola vez con TypeBox (`src/schemas.ts`); de ellos salen los tipos, los validadores, los JSON Schema y el OpenAPI.

## Qué hay

- `src/` — esquemas, límites (`LIMITS`), validadores (`validateIndex`, `validateZones`, `checkImage`…), CRC32 y el documento OpenAPI. Se usa con `import { validateIndex } from "../contract/src/index.ts"`.
- `schema/v1/*.schema.json` — JSON Schema (generados). Es lo que usa el firmware o cualquier otro lenguaje.
- `openapi/v1.json` — OpenAPI 3.1 (generado), con ejemplos y seguridad `mutualTLS`.
- `fixtures/v1/{valid,invalid}/` — ejemplos que **siempre** deben validar igual (compatibilidad, M2): solo se agregan, nunca se modifican. El nombre es `<mensaje>-<detalle>.json` (válidos) o `<mensaje>-<código>-<detalle>.json` (inválidos).

## Usarlo desde otro lenguaje

Valida cada mensaje con el archivo de `schema/v1/` que le toca (`index`, `zones`, `actions-request`, `actions-response`, `log-request`, `error`) con cualquier validador de JSON Schema 2020-12. Reglas que un esquema no expresa (ids repetidos, `current` dentro de `views`, tamaño `raw1` = `ceil(ancho / 8) × alto`, zonas dentro del panel, CRC32) están descritas en `docs/fichas/F-001-contrato-protocolo.md`. Los campos desconocidos se ignoran.

## Foco, alineación y `Tintero-View` (F-008)

- **`unaligned`** (ruta `/zones/<i>`): `x` y `w` de cada zona deben ser múltiplos de 8 (`LIMITS.zoneAlign`); así la ventana parcial del panel es la zona.
- **`focus`** (opcional, en la respuesta de zonas): `{ ring, pad, dash }` con `ring` 1–16 (grosor del anillo), `pad` 1–32 (banda en blanco por dentro de cada zona) y `dash` 0–64 (largo de los tramos del punteado; 0 = sólido). **`focus_pad`** (ruta `/focus`) si `pad < ring`.
- **Regla del anillo** (emulador y firmware): se invierten los píxeles de la zona a menos de `ring` de su borde; con `dash > 0`, uno de la franja de arriba o de abajo solo si `floor((x − zona.x) / dash)` es par, y uno de la franja izquierda o derecha solo si `floor((y − zona.y) / dash)` es par.
- **`checkFocusBand(raw1, panel, zones, pad)`** devuelve los ids de las zonas con algún píxel negro (bit 1, como todo `raw1`) a menos de `pad` px dentro de su borde: lo usa el motor para comprobar que la banda queda en blanco.
- **`Tintero-View`** (cabecera opcional, `^[a-z0-9_-]{1,16}$`): la vista que muestra el aparato. Un valor inválido es `400 invalid_request`.
- **`full_refresh: true`** significa: la próxima imagen que muestre el aparato va con el refresco completo lento.

## Regenerar y comprobar

```bash
npm run contract:schema   # escribe schema/v1 y openapi/v1.json
npm run contract:check    # falla si alguno está desactualizado
```

## Visor y simulador (requieren Docker)

```bash
npm run contract:docs   # Swagger UI en http://127.0.0.1:8099/ (especificación: /v1.json)
npm run contract:mock   # simulador Prism en http://127.0.0.1:4010/ (Ctrl+C para detener)
```

Ambos solo escuchan en `127.0.0.1`. El simulador exige las cabeceras obligatorias (`Tintero-Protocol`, `Tintero-Firmware`, `Tintero-Power`, `Tintero-Formats`, `Tintero-Panel`) y responde con los ejemplos del contrato. Las imágenes están fijadas en `tools/images.conf`.
