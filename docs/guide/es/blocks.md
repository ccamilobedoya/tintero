# Bloques

[Read in English](../en/blocks.md)

Un **bloque** es un tipo de pieza de una vista: un tablero de tareas, una agenda, un calendario del mes. Una vista es una cuadrícula y cada área de la cuadrícula tiene un bloque. Esta página lista los bloques que existen y explica cómo escribir uno nuevo.

## Qué es un bloque

Un bloque es una función `(context: BlockContext) => BlockResult` en `server/src/engine/blocks/<nombre>.ts`. Recibe los elementos de su fuente y el tamaño de su área, y devuelve HTML y cuántos elementos no pudo mostrar. No sabe de dónde vienen los datos (una integración, un archivo de prueba): solo ve los elementos. El motor pone el HTML en una página, la dibuja con Chromium y la convierte en una imagen de 1 bit.

## Los bloques que trae Tintero

| Bloque           | Fuente   | Opciones                                                                              |
| ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `task-list`      | `tasks`  | `group_by` (`category` o `none`)                                                      |
| `task-board`     | `tasks`  | `stages`, `lead`, `group_by`, `density` (`row` o `card`)                              |
| `issue-list`     | `tasks`  | `description` (true o false)                                                          |
| `agenda`         | `events` | `days` (1 a 14), `holidays` (true o false), `layout` (`days` o `column`)              |
| `month-calendar` | `events` | ninguna                                                                               |
| `calibration`    | ninguna  | ninguna (una hoja de prueba fija para revisar trazos y letras en el panel real)       |

Puedes ver cualquiera con `npm run render` ([Primeros pasos](getting-started.md)).

## Cómo se escribe un bloque nuevo

### 1. Su diseño

Usa unidades físicas del tema, nunca píxeles fijos: `context.metrics` trae los márgenes, el alto de fila y las letras ya elegidas con `pickFont`. El bloque es dueño de su diseño, incluido qué hace con el texto que no cabe (una línea con «…», varias líneas con tope…). Arma el HTML **solo** con la plantilla `html` de `html.ts`: escapa todo valor. Nada de `url()`, `@font-face` ni scripts.

### 2. Su regla de «cabe»

Usa `fitList` de `blocks/common.ts`: las filas tienen el alto de tu diseño, un encabezado solo se pone si cabe con una fila suya y, si no cabe todo, la última fila es «+N más» (`moreRow`). Devuelve `hidden` = cuántos elementos no se mostraron. Si el área es más chica que el mínimo de tu bloque, devuelve `noFit(context)` (`tooSmall`).

### 3. Sus zonas

Por cada fila que pueda tener foco, llama `context.focus(itemId, "toggle" | "open", w, h)` **en el orden de las filas** (es el orden del botón Mover) y pon el id que devuelve en `data-zone`. El motor limita las zonas a 48 y a un mínimo de 8 px, y mide la caja real del elemento. Una zona ocupa el ancho entero de la columna (`context.w`), y todo lo visible de la fila queda a `focusPad` de sus cuatro bordes, así el anillo de foco nunca toca contenido. Si el bloque no tiene foco, no llames a `focus`.

### 4. La revisión de desbordes

Marca el contenedor y cada fila con `data-fit="<área>"` (`context.area`). Después de dibujar, el motor revisa que nada se salga, ni a lo alto ni a lo ancho. Los textos cortados a propósito con «…» no cuentan.

### 5. Sus textos fijos

Nunca escribas una palabra fija en el bloque («Hoy», «Sin tareas»). Sácala de `context.msgs` y agrega una clave a **los dos** catálogos, `server/src/engine/i18n/es.ts` y `en.ts`. Una prueba unitaria comprueba que ambos tengan exactamente las mismas claves, y el `locale` del archivo de vistas elige cuál se usa.

### 6. Registrarlo

Agrega el bloque al registro de `blocks/index.ts` y a `server/src/engine/config.ts` (su nombre en `BlockName`, el tipo de fuente que lee en `BLOCK_SOURCE` y sus opciones en la lista de opciones conocidas, con sus comprobaciones). Sin eso, el archivo de vistas lo rechaza con `unknown block`.

### 7. Pruebas

Ponlas junto al código, con el `Renderer` falso de `testing.ts`. Prueba el caso vacío, el caso en que todo cabe, el de «+N más» y el de un área demasiado chica, en los dos idiomas si agregas textos.

## Probarlo

Agrega tu bloque a un archivo de vistas y míralo:

```bash
npm run render -- --views /path/to/views.json --data /path/to/data.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-26T13:00:00Z --out /tmp/tintero-views
```

`render` sale con 1 si una vista se desborda. Revisa los mismos tamaños que usarás en el panel real.
