import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkFocusBand, type Panel, type Zone } from "../../../../contract/src/index.ts";
import { ConfigError, loadDataFile, loadViewsConfig, parseViewsConfig } from "../config.ts";
import { buildView } from "../view.ts";

const REPO = resolve(import.meta.dirname, "../../../..");
const config = loadViewsConfig(join(REPO, "config/calibracion.views.example.json"));
const data = loadDataFile(join(REPO, "config/calibracion.data.example.json"), config);
const P124: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };

describe("calibration block", () => {
  it("draws the test card with no zones and no overflow marks", () => {
    const view = config.views[0];
    if (!view) throw new Error("no view");
    const built = buildView(view, { panel: P124, config, sources: data.sources, at: new Date() });
    expect(built.zones).toEqual([]);
    expect(built.tooSmall).toEqual([]);
    for (const name of [
      "Terminus 14 normal: ",
      "Terminus 14 negrita: ",
      "Terminus 16 normal: ",
      "Terminus 16 negrita: ",
      "DejaVu Sans 9 pt: ",
      "DejaVu Sans 12 pt: ",
      "DejaVu Sans 9 pt tachado: ",
    ]) {
      expect(built.html).toContain(`${name}Ñandú pingüino ÁÉÍÓÚ 0123 22 oct`);
    }
    expect(built.html).toContain("text-decoration-thickness:2px");
    expect(built.html).toContain("Foco");
    expect(built.html).toContain("Enviando");
  });

  it("takes no source", () => {
    const text = JSON.stringify({
      ...config,
      views: [
        {
          ...config.views[0],
          slots: { todo: { block: "calibration", source: "x" } },
        },
      ],
    });
    expect(() => parseViewsConfig(text)).toThrow(ConfigError);
  });
});

describe("checkFocusBand cost", () => {
  it("looks at 48 zones of the 800 x 480 panel in under 5 ms", () => {
    const raw1 = new Uint8Array(100 * 480); // all white
    const zones: Zone[] = Array.from({ length: 48 }, (_, i) => ({
      id: `z${String(i)}`,
      x: 8,
      y: 40 + i * 9,
      w: 480,
      h: 30,
      act: "toggle",
    }));
    // Best of five, after a warm-up: a loaded machine can stall any single run.
    let best = Infinity;
    for (let run = 0; run < 6; run++) {
      const start = performance.now();
      expect(checkFocusBand(raw1, P124, zones, 6)).toEqual([]);
      if (run > 0) best = Math.min(best, performance.now() - start);
    }
    expect(best).toBeLessThan(5);
  });
});
