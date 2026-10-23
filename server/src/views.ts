// Demonstration views (D2), drawn by code for any declared panel.
import type { Panel, Zone } from "../../contract/src/index.ts";
import { Canvas } from "./draw.ts";
import type { DemoState } from "./state.ts";

export interface DemoView {
  id: string;
  parent?: string;
  raw1(panel: Panel): Uint8Array;
  zones(panel: Panel): Zone[];
}

const BORDER = 2;
const MIN_ZONE = 8;

const unit = (panel: Panel): number => Math.max(1, Math.round(Math.min(panel.w, panel.h) / 24));

/** A rectangle kept inside the panel and at least 8 px wide and high. */
function rect(panel: Panel, x: number, y: number, w: number, h: number) {
  const rx = Math.max(0, Math.min(x, panel.w - MIN_ZONE));
  const ry = Math.max(0, Math.min(y, panel.h - MIN_ZONE));
  return {
    x: rx,
    y: ry,
    w: Math.max(MIN_ZONE, Math.min(w, panel.w - rx)),
    h: Math.max(MIN_ZONE, Math.min(h, panel.h - ry)),
  };
}

function demoZones(panel: Panel): Zone[] {
  const u = unit(panel);
  const box = (id: string, row: number, act: Zone["act"]): Zone => ({
    id,
    act,
    ...rect(panel, u, row * u, 6 * u, 2 * u),
  });
  return [
    box("c1", 2, "toggle"),
    box("c2", 5, "toggle"),
    box("c3", 8, "toggle"),
    box("abrir", 11, "open"),
  ];
}

/** Views that read `state` live each time they are asked to draw. */
export function makeViews(state: DemoState): DemoView[] {
  return [
    {
      id: "demo",
      raw1(panel) {
        const canvas = new Canvas(panel);
        canvas.strokeRect(0, 0, panel.w, panel.h, BORDER);
        demoZones(panel).forEach((zone, index) => {
          // eslint-disable-next-line security/detect-object-injection -- index is the numeric forEach index
          if (state.checked[index] === true) canvas.fillRect(zone.x, zone.y, zone.w, zone.h);
          else canvas.strokeRect(zone.x, zone.y, zone.w, zone.h, BORDER);
        });
        return canvas.bytes();
      },
      zones: demoZones,
    },
    {
      id: "detalle",
      parent: "demo",
      raw1(panel) {
        const u = unit(panel);
        const canvas = new Canvas(panel);
        canvas.strokeRect(0, 0, panel.w, panel.h, BORDER);
        canvas.fillRect(u, u, 4 * u, 4 * u);
        return canvas.bytes();
      },
      zones: () => [],
    },
    {
      id: "patron",
      raw1(panel) {
        const canvas = new Canvas(panel);
        canvas.strokeRect(0, 0, panel.w, panel.h, BORDER);
        const step = panel.dpi / 2.54;
        for (let k = 1; Math.round(k * step) < panel.w; k++) canvas.vline(Math.round(k * step));
        for (let k = 1; Math.round(k * step) < panel.h; k++) canvas.hline(Math.round(k * step));
        return canvas.bytes();
      },
      zones: () => [],
    },
  ];
}

/** Part of the state that changes how a view looks (cache key). */
export function contentKey(id: string, state: DemoState): string {
  return id === "demo" ? state.checked.map((c) => (c ? "1" : "0")).join("") : "";
}
