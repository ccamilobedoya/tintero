import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ContractErrorCode, Panel, Validation } from "./index.ts";
import {
  LIMITS,
  checkImage,
  crc32Hex,
  formatPanelHeader,
  parsePanelHeader,
  raw1Bytes,
  validateActionsRequest,
  validateActionsResponse,
  validateDeviceHeaders,
  validateErrorBody,
  validateIndex,
  validateLogRequest,
  validateZones,
} from "./index.ts";

const P800: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const P648: Panel = { w: 648, h: 480, dpi: 133, depth: 1 };

function fixture(path: string): Record<string, unknown> {
  const file = join(import.meta.dirname, "..", "fixtures", "v1", path);
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- fixed fixtures folder
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}
const indexOk = () => fixture("valid/index-basic.json");
const zonesOk = () => fixture("valid/zones-basic.json");
const text = (value: unknown) => JSON.stringify(value);

function codes(result: Validation<unknown>): ContractErrorCode[] {
  return result.ok ? [] : result.errors.map((error) => error.code);
}
function view(overrides: Record<string, unknown>, id = "todo"): Record<string, unknown> {
  return { id, hash: "9f2c1a7b", format: "raw1", bytes: 48000, crc32: "3a1f09c4", ...overrides };
}

describe("validateIndex", () => {
  it("accepts the example (CA1)", () => {
    expect(validateIndex(text(indexOk())).ok).toBe(true);
  });

  it("rejects each bad case with its code (CA2)", () => {
    const base = indexOk();
    const cases: [Record<string, unknown>, ContractErrorCode][] = [
      [{ ...base, views: [view({}), view({}, "todo")] }, "duplicate_id"],
      [{ ...base, current: "ghost" }, "unknown_current"],
      [
        { ...base, views: Array.from({ length: 17 }, (_, i) => view({}, `v${String(i)}`)) },
        "schema",
      ],
      [{ ...base, views: [view({}, "Todo")] }, "schema"],
      [{ ...base, next_wake_s: 10 }, "schema"],
      [{ ...base, views: [view({ bytes: 47999 })] }, "raw1_size"],
    ];
    for (const [body, code] of cases) expect(codes(validateIndex(text(body)))).toContain(code);
    expect(codes(validateIndex("not json"))).toEqual(["invalid_json"]);
  });

  it("rejects an oversize but well-formed index (CA3)", () => {
    const big = { ...indexOk(), pad: "x".repeat(2100) };
    expect(codes(validateIndex(text(big)))).toEqual(["too_large"]);
  });

  it("rejects an oversize body before parsing it", () => {
    const raw = "x".repeat(LIMITS.maxIndexBytes + 1);
    expect(codes(validateIndex(raw))).toEqual(["too_large"]);
  });

  it("checks raw1 size against the declared panel (CA17)", () => {
    const base = { ...indexOk(), panel: P648, current: "todo" };
    expect(validateIndex(text({ ...base, views: [view({ bytes: 38880 })] })).ok).toBe(true);
    expect(codes(validateIndex(text({ ...base, views: [view({ bytes: 48000 })] })))).toContain(
      "raw1_size",
    );
  });

  it("requires crc32 and its shape (CA13)", () => {
    const withoutCrc = Object.fromEntries(
      Object.entries(view({})).filter(([key]) => key !== "crc32"),
    );
    expect(codes(validateIndex(text({ ...indexOk(), views: [withoutCrc] })))).toContain("schema");
    expect(codes(validateIndex(text({ ...indexOk(), views: [view({ crc32: "XYZ" })] })))).toContain(
      "schema",
    );
  });

  it("reports every error it can find", () => {
    const body = { ...indexOk(), current: "ghost", views: [view({ bytes: 1 }), view({})] };
    expect(codes(validateIndex(text(body))).sort()).toEqual(
      ["duplicate_id", "raw1_size", "unknown_current"].sort(),
    );
  });

  it("reports JSON Pointer paths", () => {
    const body = { ...indexOk(), views: [view({}), view({}, "Bad")] };
    const result = validateIndex(text(body));
    expect(!result.ok && result.errors.map((e) => e.path)).toContain("/views/1/id");
  });

  it("ignores and drops unknown fields, and survives __proto__ (CA9)", () => {
    const raw = text(indexOk()).replace("{", '{"__proto__":{"polluted":true},"extra":1,');
    const result = validateIndex(raw);
    expect(result.ok).toBe(true);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
    if (result.ok) {
      expect(Object.keys(result.value)).not.toContain("extra");
      expect(Object.keys(result.value)).not.toContain("__proto__");
    }
  });

  it("is fast on a 2048-byte index", () => {
    const filler = { ...indexOk(), pad: "" };
    const room = LIMITS.maxIndexBytes - Buffer.byteLength(text(filler));
    const raw = text({ ...filler, pad: "x".repeat(room) });
    expect(Buffer.byteLength(raw)).toBe(LIMITS.maxIndexBytes);
    const start = performance.now();
    for (let i = 0; i < 1000; i++) validateIndex(raw);
    expect((performance.now() - start) / 1000).toBeLessThan(5);
  });
});

describe("validateZones", () => {
  const zone = (overrides: Record<string, unknown>, id = "t1") => ({
    id,
    x: 24,
    y: 72,
    w: 50,
    h: 40,
    act: "toggle",
    ...overrides,
  });
  const body = (zones: unknown[]) => text({ ...zonesOk(), zones });

  it("accepts the example (CA4)", () => {
    expect(validateZones(text(zonesOk()), P800).ok).toBe(true);
  });

  it("rejects each bad case (CA4)", () => {
    expect(codes(validateZones(body([zone({ x: 700, w: 120 })]), P800))).toEqual(["out_of_panel"]);
    expect(codes(validateZones(body([zone({ w: 4 })]), P800))).toContain("schema");
    expect(codes(validateZones(body([zone({}), zone({})]), P800))).toEqual(["duplicate_id"]);
    const many = Array.from({ length: 49 }, (_, i) => zone({}, `z${String(i)}`));
    expect(codes(validateZones(body(many), P800))).toContain("schema");
    expect(codes(validateZones(body([zone({ act: "delete" })]), P800))).toContain("schema");
  });

  it("uses the declared panel (CA17)", () => {
    const wide = body([zone({ x: 600, w: 60 })]);
    expect(validateZones(wide, P800).ok).toBe(true);
    expect(codes(validateZones(wide, P648))).toEqual(["out_of_panel"]);
  });

  it("rejects zones that overflow vertically and oversize bodies", () => {
    expect(codes(validateZones(body([zone({ y: 450, h: 40 })]), P800))).toEqual(["out_of_panel"]);
    const huge = text({ ...zonesOk(), pad: "x".repeat(4100) });
    expect(codes(validateZones(huge, P800))).toEqual(["too_large"]);
  });
});

describe("actions, log and error bodies", () => {
  const action = (id: string) => ({ id, view: "todo", zone: "t2", act: "toggle", at: 1761096123 });
  const actions = (n: number) => ({
    actions: Array.from({ length: n }, (_, i) => action(`a7f3c9e2b${String(i)}`)),
  });

  it("validates action requests (CA5)", () => {
    expect(validateActionsRequest(text(actions(1))).ok).toBe(true);
    expect(validateActionsRequest(text(actions(8))).ok).toBe(true);
    expect(codes(validateActionsRequest(text(actions(0))))).toContain("schema");
    expect(codes(validateActionsRequest(text(actions(9))))).toContain("schema");
    expect(codes(validateActionsRequest(text({ actions: [action("abcde")] })))).toContain("schema");
  });

  it("validates action responses (CA5)", () => {
    expect(validateActionsResponse(text(fixture("valid/actions-response-basic.json"))).ok).toBe(
      true,
    );
    const bad = { results: [{ id: "a7f3c9e2b1", status: "ok" }], index_changed: true };
    expect(codes(validateActionsResponse(text(bad)))).toContain("schema");
  });

  it("validates log requests (CA6)", () => {
    const entry = { at: 1761096200, level: "warn", msg: "x" };
    expect(validateLogRequest(text(fixture("valid/log-request-basic.json"))).ok).toBe(true);
    expect(codes(validateLogRequest(text({ entries: Array(11).fill(entry) })))).toContain("schema");
    const long = { entries: [{ ...entry, msg: "m".repeat(201) }] };
    expect(codes(validateLogRequest(text(long)))).toContain("schema");
  });

  it("validates error bodies (CA7)", () => {
    for (const code of [
      "invalid_request",
      "unknown_view",
      "stale_view",
      "stale_zone",
      "too_large",
      "too_many",
      "busy",
    ]) {
      expect(validateErrorBody(text({ error: { code, msg: "" } })).ok).toBe(true);
    }
    expect(codes(validateErrorBody(text({ error: { code: "teapot", msg: "" } })))).toContain(
      "schema",
    );
  });
});

describe("panel header and device headers", () => {
  const headers = {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "0.1.0",
    "Tintero-Power": "battery",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
  };

  it("parses and formats the panel header (CA18)", () => {
    const parsed = parsePanelHeader("w=800,h=480,dpi=124,depth=1");
    expect(parsed).toEqual({ ok: true, value: P800 });
    expect(formatPanelHeader(P800)).toBe("w=800,h=480,dpi=124,depth=1");
    for (const bad of [
      "w=4,h=480,dpi=124,depth=1",
      "w=800,h=480,dpi=20,depth=1",
      "w=800,h=480,dpi=124,depth=3",
      "hello",
      "",
    ]) {
      expect(codes(parsePanelHeader(bad))).toEqual(["schema"]);
    }
  });

  it("accepts lower and upper case names and ignores unknown headers (CA8)", () => {
    const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    expect(validateDeviceHeaders({ ...lower, "x-other": "1" }).ok).toBe(true);
    const upper = validateDeviceHeaders({
      ...headers,
      "Tintero-Battery-mV": "3700",
      "Tintero-RSSI": "-60",
    });
    expect(upper.ok && upper.value).toMatchObject({ batteryMv: 3700, rssi: -60, panel: P800 });
  });

  it("rejects missing or out-of-range headers (CA8, CA14, CA18)", () => {
    const without = (name: string) =>
      Object.fromEntries(Object.entries(headers).filter(([key]) => key !== name));
    for (const name of Object.keys(headers)) {
      expect(codes(validateDeviceHeaders(without(name)))).toContain("schema");
    }
    expect(codes(validateDeviceHeaders({ ...headers, "Tintero-Battery-mV": "9000" }))).toEqual([
      "schema",
    ]);
    for (const formats of ["", "bmp", "raw1,bmp"]) {
      expect(codes(validateDeviceHeaders({ ...headers, "Tintero-Formats": formats }))).toContain(
        "schema",
      );
    }
    expect(validateDeviceHeaders({ ...headers, "Tintero-Formats": "raw1,png1" }).ok).toBe(true);
  });
});

function png(width: number, height: number, depth = 1, interlace = 0): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(Number.parseInt(crc32Hex(body), 16), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = depth;
  ihdr[9] = 0;
  ihdr[12] = interlace;
  const idat = deflateSync(Buffer.alloc((Math.ceil(width / 8) + 1) * height));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

describe("images and CRC", () => {
  it("computes raw1 sizes (CA17)", () => {
    expect(raw1Bytes(P800)).toBe(48000);
    expect(raw1Bytes(P648)).toBe(38880);
    expect(raw1Bytes({ w: 122, h: 250, dpi: 130, depth: 1 })).toBe(4000);
    expect(raw1Bytes({ w: 2048, h: 2048, dpi: 100, depth: 1 })).toBe(524288);
  });

  it("checks raw1 length (CA10)", () => {
    expect(checkImage("raw1", new Uint8Array(48000), P800).ok).toBe(true);
    expect(codes(checkImage("raw1", new Uint8Array(47999), P800))).toEqual(["bad_image"]);
  });

  it("checks png1 header (CA10)", () => {
    expect(checkImage("png1", png(800, 480), P800).ok).toBe(true);
    expect(codes(checkImage("png1", png(800, 479), P800))).toEqual(["bad_image"]);
    expect(codes(checkImage("png1", png(800, 480, 8), P800))).toEqual(["bad_image"]);
    expect(codes(checkImage("png1", png(800, 480, 1, 1), P800))).toEqual(["bad_image"]);
    expect(codes(checkImage("png1", new Uint8Array(100), P800))).toEqual(["bad_image"]);
    expect(codes(checkImage("png1", new Uint8Array(0), P800))).toEqual(["bad_image"]);
  });

  it("rejects images over the byte limit", () => {
    expect(codes(checkImage("raw1", new Uint8Array(LIMITS.maxImageBytes + 1), P800))).toEqual([
      "too_large",
    ]);
  });

  it("computes the standard CRC-32 and compares it (CA13)", () => {
    const check = new TextEncoder().encode("123456789");
    expect(crc32Hex(check)).toBe("cbf43926");
    expect(crc32Hex(new Uint8Array(0))).toBe("00000000");
    const bytes = new Uint8Array(48000);
    expect(checkImage("raw1", bytes, P800, crc32Hex(bytes)).ok).toBe(true);
    expect(codes(checkImage("raw1", bytes, P800, "00000001"))).toEqual(["crc_mismatch"]);
  });
});
