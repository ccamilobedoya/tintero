import { describe, expect, it } from "vitest";
import {
  checkImage,
  raw1Bytes,
  crc32Hex,
  parsePanelHeader,
  formatPanelHeader,
  validateIndex,
  validateZones,
  LIMITS,
  PROTOCOL_VERSION,
  type Panel,
} from "../../../contract/src/index.ts";
import { PANEL, indexDoc, view, zone, zonesDoc, j, hasCode, makePng } from "./helpers.ts";

describe("CA10 imágenes", () => {
  it("raw1: 48000 acepta, 47999 → bad_image", () => {
    expect(checkImage("raw1", new Uint8Array(48000), PANEL).ok).toBe(true);
    expect(hasCode(checkImage("raw1", new Uint8Array(47999), PANEL), "bad_image")).toBe(true);
    expect(hasCode(checkImage("raw1", new Uint8Array(48001), PANEL), "bad_image")).toBe(true);
  });
  it("png1: acepta 800×480 gris 1 bit sin entrelazado", () => {
    expect(checkImage("png1", makePng(800, 480), PANEL).ok).toBe(true);
  });
  it("png1: rechaza 800×479", () => {
    expect(hasCode(checkImage("png1", makePng(800, 479), PANEL), "bad_image")).toBe(true);
  });
  it("png1: rechaza profundidad 8", () => {
    const r = checkImage("png1", makePng(800, 480, { depth: 8 }), PANEL);
    expect(hasCode(r, "bad_image")).toBe(true);
  });
  it("png1: rechaza entrelazado", () => {
    const r = checkImage("png1", makePng(800, 480, { interlace: 1 }), PANEL);
    expect(hasCode(r, "bad_image")).toBe(true);
  });
  it("png1: rechaza bytes que no son PNG", () => {
    expect(hasCode(checkImage("png1", new Uint8Array(1000), PANEL), "bad_image")).toBe(true);
    expect(hasCode(checkImage("png1", new Uint8Array(0), PANEL), "bad_image")).toBe(true);
  });
});

describe("CA13 CRC32", () => {
  const ascii = new TextEncoder().encode("123456789");
  it("valor de control", () => {
    expect(crc32Hex(ascii)).toBe("cbf43926");
  });
  it("checkImage acepta el CRC correcto y rechaza otro", () => {
    const bytes = new Uint8Array(48000).fill(0xa5);
    const crc = crc32Hex(bytes);
    expect(crc).toMatch(/^[0-9a-f]{8}$/);
    expect(checkImage("raw1", bytes, PANEL, crc).ok).toBe(true);
    const other = crc === "00000000" ? "00000001" : "00000000";
    expect(hasCode(checkImage("raw1", bytes, PANEL, other), "crc_mismatch")).toBe(true);
  });
  it("índice sin crc32 → schema", () => {
    const v = view("todo");
    delete v.crc32;
    expect(hasCode(validateIndex(j(indexDoc({ views: [v] }))), "schema")).toBe(true);
  });
  it('crc32 "XYZ" → schema', () => {
    const r = validateIndex(j(indexDoc({ views: [view("todo", { crc32: "XYZ" })] })));
    expect(hasCode(r, "schema")).toBe(true);
  });
});

describe("CA17 otros paneles", () => {
  const p648: Panel = { w: 648, h: 480, dpi: 166, depth: 1 };
  it("raw1Bytes", () => {
    expect(raw1Bytes(PANEL)).toBe(48000);
    expect(raw1Bytes(p648)).toBe(38880);
    expect(raw1Bytes({ w: 122, h: 250, dpi: 130, depth: 1 })).toBe(4000);
  });
  it("índice 648×480 con 38880 valida", () => {
    const r = validateIndex(j(indexDoc({ panel: p648, views: [view("todo", { bytes: 38880 })] })));
    expect(r.ok).toBe(true);
  });
  it("índice 648×480 con 48000 → raw1_size", () => {
    const r = validateIndex(j(indexDoc({ panel: p648, views: [view("todo", { bytes: 48000 })] })));
    expect(hasCode(r, "raw1_size")).toBe(true);
  });
  it("zona x:600 w:60 en 648×480 → out_of_panel", () => {
    const r = validateZones(j(zonesDoc({ zones: [zone("a", { x: 600, w: 60 })] })), p648);
    expect(hasCode(r, "out_of_panel")).toBe(true);
  });
  it("checkImage raw1 usa el tamaño del panel dado", () => {
    expect(checkImage("raw1", new Uint8Array(38880), p648).ok).toBe(true);
    expect(hasCode(checkImage("raw1", new Uint8Array(48000), p648), "bad_image")).toBe(true);
  });
});

describe("CA18 cabecera de panel", () => {
  it("parse y format", () => {
    const r = parsePanelHeader("w=800,h=480,dpi=124,depth=1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual({ w: 800, h: 480, dpi: 124, depth: 1 });
      expect(formatPanelHeader(r.value)).toBe("w=800,h=480,dpi=124,depth=1");
    }
  });
  it.each([
    "w=4,h=480,dpi=124,depth=1",
    "w=800,h=480,dpi=20,depth=1",
    "w=800,h=480,dpi=124,depth=3",
    "esto no es un panel",
    "",
    "w=800,h=480",
  ])("rechaza %j (schema)", (txt) => {
    expect(hasCode(parsePanelHeader(txt), "schema")).toBe(true);
  });
});

describe("Constantes", () => {
  it("PROTOCOL_VERSION y LIMITS", () => {
    expect(PROTOCOL_VERSION).toBe(1);
    expect(LIMITS).toMatchObject({
      maxIndexBytes: 2048,
      maxZonesBytes: 4096,
      maxViews: 16,
      maxZones: 48,
      minZoneSize: 8,
      maxImageBytes: 1048576,
      minWakeS: 30,
      maxWakeS: 86400,
      maxActions: 8,
      maxLogEntries: 10,
      maxLogMsg: 200,
    });
  });
});
