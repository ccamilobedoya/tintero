/* eslint-disable security/detect-non-literal-fs-filename -- archivos de ejemplo del repo */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateZones, type Panel } from "../../../contract/src/index.ts";
import {
  createEngine,
  parseDataFile,
  parseViewsConfig,
  type Engine,
} from "../../../server/src/engine/index.ts";
import { createApp } from "../../../server/src/index.ts";
import {
  API,
  NOW,
  P124,
  P200,
  ROOT,
  V124,
  closeEngines15,
  devHeaders,
  drawEngine,
  isBlack,
  launchChromium,
  mkEngine,
  mkEngine15,
  mkEngine6,
  type Drawn15,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
beforeAll(async () => {
  cr = await launchChromium();
}, 120_000);
const own: Engine[] = [];
afterAll(async () => {
  await closeEngines15();
  for (const e of own) {
    try {
      await e.idle();
      await e.close();
    } catch {
      /* closing anyway */
    }
  }
  await cr.stop();
}, 120_000);

/** Longest vertical run of black pixels in a column. */
function longestRun(raw1: Uint8Array, w: number, h: number, x: number): number {
  let best = 0;
  let run = 0;
  for (let y = 0; y < h; y++) {
    if (isBlack(raw1, w, x, y)) best = Math.max(best, ++run);
    else run = 0;
  }
  return best;
}

const agendaEngine = (): Engine => {
  const config = parseViewsConfig(
    readFileSync(join(ROOT, "config/agenda.views.example.json"), "utf8"),
  );
  const data = parseDataFile(
    readFileSync(join(ROOT, "config/agenda.data.example.json"), "utf8"),
    config,
  );
  const e = createEngine({
    nextWakeS: 1800,
    clock: () => new Date(NOW),
    config,
    data,
    renderer: cr.renderer,
  });
  own.push(e);
  return e;
};

/** `tooSmall` de cada vista tal como lo da `main` (medido antes de esta ficha); lo que no está, `[]`. */
type TooSmall = Record<string, string[]>;
interface Set15 {
  name: string;
  make: () => Engine;
  tooSmall: Partial<Record<"P124" | "P200" | "V124", TooSmall>>;
  /** Con `hechas` vacío, `tablero` en P200 desborda en `main` (Hallazgo previo). */
  knownOverflow?: { view: string; panel: "P200"; value: string[] };
}
const sets: Set15[] = [
  {
    name: "los ejemplos de hoy",
    make: () => mkEngine15(cr.renderer),
    tooSmall: { P200: { hoy: ["proximos", "mes"] } },
    knownOverflow: { view: "tablero", panel: "P200", value: ["hechas"] },
  },
  {
    name: "los del tablero",
    make: () => {
      const e = mkEngine6(cr.renderer);
      own.push(e);
      return e;
    },
    tooSmall: { P200: { hoy: ["mes"] } },
  },
  {
    name: "los de F-005",
    make: () => {
      const e = mkEngine(cr.renderer);
      own.push(e);
      return e;
    },
    tooSmall: { P200: { hoy: ["jira", "calendario"] }, V124: { hoy: ["jira"] } },
  },
  {
    name: "agenda",
    make: agendaEngine,
    tooSmall: { P200: { agenda: ["mes"] }, V124: { agenda: ["mes"] } },
  },
];
const panels: [
  string,
  "P124" | "P200" | "V124",
  Panel,
  { ring: number; pad: number; dash: number },
][] = [
  ["P124", "P124", P124, { ring: 3, pad: 6, dash: 8 }],
  ["P200", "P200", P200, { ring: 5, pad: 9, dash: 8 }],
  ["V124", "V124", V124, { ring: 3, pad: 6, dash: 8 }],
];

describe("CA13 propiedades de todas las vistas", () => {
  for (const set of sets) {
    for (const [panelName, key, panel, focus] of panels) {
      it(`${set.name} en ${panelName}`, async () => {
        const d: Drawn15 = await drawEngine(cr, set.make(), panel);
        const app = createApp({ nextWakeS: 1800, headersTimeoutMs: 10_000, engine: d.engine }).app;
        try {
          expect(d.views.length).toBeGreaterThan(0);
          expect(d.gray.length).toBeGreaterThan(0);
          for (const g of d.gray) expect(g).toBe(0);
          const known = set.knownOverflow?.panel === key ? set.knownOverflow : undefined;
          for (const o of d.overflow) {
            if (known && o.length > 0) expect(o).toEqual(known.value);
            else expect(o).toEqual([]);
          }
          for (const v of d.views) {
            const tag = `${v.id} en ${panelName}`;
            if (known?.view === v.id) expect([[], known.value], tag).toContainEqual(v.overflow);
            else expect(v.overflow, tag).toEqual([]);
            expect(v.bandInk, tag).toEqual([]);
            expect([...v.tooSmall].sort(), `tooSmall de ${tag}`).toEqual(
              [...(set.tooSmall[key]?.[v.id] ?? [])].sort(),
            );
            for (const z of v.zones) {
              expect(z.x % 8, `${tag} ${z.id} x`).toBe(0);
              expect(z.w % 8, `${tag} ${z.id} w`).toBe(0);
              expect(z.x, tag).toBeGreaterThanOrEqual(4);
              expect(z.y, tag).toBeGreaterThanOrEqual(4);
              expect(z.x + z.w, tag).toBeLessThanOrEqual(panel.w - 4);
              expect(z.y + z.h, tag).toBeLessThanOrEqual(panel.h - 4);
              for (const x of [z.x - 3, z.x - 2, z.x - 1, z.x + z.w, z.x + z.w + 1, z.x + z.w + 2])
                expect(
                  longestRun(v.raw1, panel.w, panel.h, x),
                  `${tag} ${z.id} divisor en x=${String(x)}`,
                ).toBeLessThan(100);
            }
            const res = await app.inject({
              method: "GET",
              url: `${API}/views/${v.id}/zones?h=${v.hash}`,
              headers: devHeaders(panel),
            });
            expect(res.statusCode, tag).toBe(200);
            const z = validateZones(res.body, panel);
            expect(z.ok, tag + JSON.stringify(z)).toBe(true);
            if (z.ok) {
              expect((z.value as unknown as { focus: unknown }).focus, tag).toEqual(focus);
              expect(
                z.value.zones.map((q) => q.id),
                tag,
              ).toEqual(v.zones.map((q) => q.id));
            }
            expect(v.focus, tag).toEqual(focus);
          }
        } finally {
          await app.close();
        }
      }, 180_000);
    }
  }
});
