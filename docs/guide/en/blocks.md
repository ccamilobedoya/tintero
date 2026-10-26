# Blocks

[Leer en español](../es/blocks.md)

A **block** is one kind of view piece: a task board, an agenda, a month calendar. A view is a grid, and each area of the grid holds one block. This page lists the blocks that exist and explains how to write a new one.

## What a block is

A block is a function `(context: BlockContext) => BlockResult` in `server/src/engine/blocks/<name>.ts`. It receives the items of its source and the size of its area, and returns HTML plus how many items it could not show. It does not know where the data comes from (an integration, a test file): it only sees the items. The engine puts the HTML in a page, draws it with Chromium and turns it into a 1-bit image.

## The blocks that come with Tintero

| Block            | Source   | Options                                                                               |
| ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `task-list`      | `tasks`  | `group_by` (`category` or `none`)                                                     |
| `task-board`     | `tasks`  | `stages`, `lead`, `group_by`, `density` (`row` or `card`)                             |
| `issue-list`     | `tasks`  | `description` (true or false)                                                         |
| `agenda`         | `events` | `days` (1 to 14), `holidays` (true or false), `layout` (`days` or `column`)           |
| `month-calendar` | `events` | none                                                                                  |
| `calibration`    | none     | none (a fixed test sheet to check strokes and fonts on the real panel)                |

You can see any of them with `npm run render` ([Getting started](getting-started.md)).

## How to write a new block

### 1. Its layout

Use physical units from the theme, never fixed pixels: `context.metrics` has the margins, the row height, and the fonts already chosen with `pickFont`. The block owns its design, including what it does with text that does not fit (one line with "…", several lines with a limit…). Build the HTML **only** with the `html` template from `html.ts`: it escapes every value. No `url()`, no `@font-face`, no scripts.

### 2. Its "does it fit" rule

Use `fitList` from `blocks/common.ts`: rows have the height of your design, a header is drawn only if it fits with one of its rows, and if not everything fits, the last row is "+N more" (`moreRow`). Return `hidden` = how many items were not shown. If the area is smaller than the minimum your block needs, return `noFit(context)` (`tooSmall`).

### 3. Its zones

For each row that can take focus, call `context.focus(itemId, "toggle" | "open", w, h)` **in the order of the rows** (this is the order of the Move button) and put the id it returns in `data-zone`. The engine limits zones to 48 and at least 8 px, and measures the real box of the element. A zone takes the whole width of the column (`context.w`), and everything visible in the row stays inside `focusPad` of its four edges, so the focus ring never touches content. If the block has no focus, do not call `focus`.

### 4. The overflow check

Mark the container and each row with `data-fit="<area>"` (`context.area`). After drawing, the engine checks that nothing goes outside, vertically or horizontally. Texts cut on purpose with "…" are not counted.

### 5. Its fixed texts

Never write a fixed word in the block ("Today", "No tasks"). Take it from `context.msgs`, and add a key to **both** catalogs, `server/src/engine/i18n/es.ts` and `en.ts`. A unit test checks that both have exactly the same keys, and the views file's `locale` chooses which one is used.

### 6. Register it

Add the block to the registry in `blocks/index.ts` and to `server/src/engine/config.ts` (its name in `BlockName`, the type of source it reads in `BLOCK_SOURCE`, and its options in the list of known options with their checks). Without that, the views file rejects it with `unknown block`.

### 7. Tests

Put them next to the code, with the fake `Renderer` from `testing.ts`. Test the empty case, the case where everything fits, the "+N more" case and the too-small case, in both languages if you add texts.

## Try it

Add your block to a views file and look at it:

```bash
npm run render -- --views /path/to/views.json --data /path/to/data.json \
  --panel w=800,h=480,dpi=124,depth=1 --now 2026-10-26T13:00:00Z --out /tmp/tintero-views
```

`render` exits with 1 if a view overflows. Check the same sizes you will use on the real panel.
