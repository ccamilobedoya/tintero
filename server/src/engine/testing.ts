// A fake `Renderer` for unit tests (no Docker): boxes come from the `data-zone` attributes.
import { createHash } from "node:crypto";
import { raw1Bytes, type Panel } from "../../../contract/src/index.ts";
import type { RenderOutput, Renderer } from "./chromium.ts";

export interface FakeRenderer extends Renderer {
  calls: string[];
}

export function fakeRenderer(options: { delayMs?: number; failTimes?: number } = {}): FakeRenderer {
  let failures = options.failTimes ?? 0;
  const calls: string[] = [];
  return {
    calls,
    async render(html: string, panel: Panel): Promise<RenderOutput> {
      calls.push(html);
      if (options.delayMs) {
        await new Promise((resolve) => {
          setTimeout(resolve, options.delayMs);
        });
      }
      if (failures > 0) {
        failures--;
        throw new Error("render failed");
      }
      const zones = [...html.matchAll(/data-zone="(z[0-9a-f]{10})"/g)];
      const raw1 = new Uint8Array(raw1Bytes(panel));
      raw1.set(createHash("sha256").update(html).digest());
      return {
        raw1,
        gray: 0,
        overflow: [],
        boxes: zones.map((match, i) => ({
          key: match[1] ?? "",
          x: 10,
          y: 20 + i * 26,
          w: Math.max(8, panel.w - 20),
          h: 24,
        })),
      };
    },
    blockedRequests: () => 0,
    close: () => Promise.resolve(),
  };
}
