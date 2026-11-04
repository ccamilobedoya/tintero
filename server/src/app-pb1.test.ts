import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  crc32Hex,
  formatPanelHeader,
  raw1Bytes,
  unpackBits,
  validateIndex,
  type IndexResponse,
  type Panel,
  type ZonesResponse,
} from "../../contract/src/index.ts";
import { createApp, trimIndex, trimZones } from "./app.ts";

const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const config = { nextWakeS: 1800, headersTimeoutMs: 10_000 };

const headers = (formats: string): Record<string, string> => ({
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "test-1",
  "Tintero-Power": "usb",
  "Tintero-Formats": formats,
  "Tintero-Panel": formatPanelHeader(PANEL),
});

let lines: string[];
beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("pb1 negotiation (F-019)", () => {
  it("serves pb1 views whose crc32 is that of the decoded raw1", async () => {
    const { app } = createApp(config);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/index",
      headers: headers("pb1,raw1"),
    });
    const parsed = validateIndex(res.body);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const view of parsed.value.views) {
      const image = await app.inject({
        method: "GET",
        url: `/api/v1/views/${view.id}/image?h=${view.hash}`,
        headers: headers("pb1,raw1"),
      });
      if (view.format === "pb1") {
        expect(image.rawPayload.length).toBe(view.bytes);
        expect(view.bytes).toBeLessThan(raw1Bytes(PANEL));
        const raw = unpackBits(image.rawPayload, raw1Bytes(PANEL));
        expect(crc32Hex(raw)).toBe(view.crc32);
      } else {
        expect(image.rawPayload.length).toBe(raw1Bytes(PANEL));
        expect(crc32Hex(image.rawPayload)).toBe(view.crc32);
      }
    }
    expect(parsed.value.views.some((view) => view.format === "pb1")).toBe(true);
    await app.close();
  });

  it("keeps raw1 for devices that only declare raw1", async () => {
    const { app } = createApp(config);
    const res = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers("raw1") });
    const parsed = validateIndex(res.body);
    expect(parsed.ok && parsed.value.views.every((view) => view.format === "raw1")).toBe(true);
    await app.close();
  });

  it("ignores unknown format names but needs raw1 (R8)", async () => {
    const { app } = createApp(config);
    const ok = await app.inject({
      method: "GET",
      url: "/api/v1/index",
      headers: headers("bmp,raw1"),
    });
    expect(ok.statusCode).toBe(200);
    const bad = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers("bmp") });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });
});

function viewFor(i: number, parent?: string): IndexResponse["views"][number] {
  const id = `view-${String(i).padStart(11, "0")}`; // 16 characters
  return {
    id,
    hash: "0123456789abcdef",
    format: "raw1",
    bytes: 48_000,
    crc32: "deadbeef",
    ...(parent === undefined ? {} : { parent }),
  };
}

describe("trimIndex / trimZones (R12)", () => {
  it("drops views from the end until the index fits, keeping current and its parent", () => {
    const first = viewFor(0);
    const views = [first, ...Array.from({ length: 15 }, (_, i) => viewFor(i + 1, first.id))];
    const body: IndexResponse = {
      protocol: 1,
      server_time: 1,
      next_wake_s: 60,
      full_refresh: false,
      panel: PANEL,
      current: views[3]?.id ?? "",
      views,
    };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(2048);
    const removed = trimIndex(body);
    const text = JSON.stringify(body);
    expect(removed).toBeGreaterThan(0);
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(2048);
    expect(body.views.some((view) => view.id === body.current)).toBe(true);
    expect(validateIndex(text).ok).toBe(true);
  });

  it("leaves a small index alone", () => {
    const body: IndexResponse = {
      protocol: 1,
      server_time: 1,
      next_wake_s: 60,
      full_refresh: false,
      panel: PANEL,
      current: viewFor(0).id,
      views: [viewFor(0)],
    };
    expect(trimIndex(body)).toBe(0);
  });

  it("drops zones from the end until the response fits", () => {
    const zones = Array.from({ length: 100 }, (_, i) => ({
      id: `zone-${String(i).padStart(11, "0")}`,
      x: 8,
      y: 8,
      w: 800 - 16,
      h: 8,
      act: "toggle" as const,
    }));
    const body: ZonesResponse = { view: "a", hash: "0123456789abcdef", zones };
    expect(Buffer.byteLength(JSON.stringify(body))).toBeGreaterThan(4096);
    const removed = trimZones(body);
    expect(removed).toBeGreaterThan(0);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(4096);
  });
});
