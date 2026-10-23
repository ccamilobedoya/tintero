import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkImage,
  validateDeviceHeaders,
  validateLogRequest,
} from "../../../contract/src/index.ts";
import { runWake } from "../../../emulator/src/index.ts";
import { cfg, decodePng1, headersOf, pngBit, snapshot } from "./helpers.ts";
import {
  PANEL,
  TestServer,
  flashUsed,
  pixel,
  readStoreFile,
  reqLine,
  rmStore,
  storeHas,
  tmpStore,
  viewFiles,
} from "./testserver.ts";

const API = "/api/v1";
let srv: TestServer;
let store: string;

beforeEach(async () => {
  srv = new TestServer();
  await srv.start();
  store = tmpStore();
});
afterEach(async () => {
  await srv.stop();
  rmStore(store);
});

const lines = (s: TestServer): string[] => s.log.map(reqLine);

describe("CA1 primera despertada con batería", () => {
  it("índice, todo, agenda (current + 1 extra), en orden", async () => {
    const r = await runWake(cfg(srv.url, store, { power: "battery", extraViewsPerWake: 1 }));
    const expected = [
      `GET ${API}/index`,
      `GET ${API}/views/todo/image`,
      `GET ${API}/views/todo/zones`,
      `GET ${API}/views/agenda/image`,
      `GET ${API}/views/agenda/zones`,
    ];
    expect(lines(srv)).toEqual(expected);
    expect(r.requests.map((q) => `${q.method} ${q.path.split("?")[0]}`)).toEqual(expected);
    expect(r.requests.find((q) => q.path.includes("todo/image"))?.path).toBe(
      `${API}/views/todo/image?h=9f2c1a7b`,
    );
    expect(r.downloaded).toEqual(["todo", "agenda"]);
    expect(r.current).toBe("todo");
  });
});

describe("CA2 segunda y tercera despertada", () => {
  it("2.ª baja jira; 3.ª solo el índice", async () => {
    const c = cfg(srv.url, store, { power: "battery", extraViewsPerWake: 1 });
    await runWake(c);
    srv.resetCounters();
    const r2 = await runWake(c);
    expect(lines(srv)).toEqual([
      `GET ${API}/index`,
      `GET ${API}/views/jira/image`,
      `GET ${API}/views/jira/zones`,
    ]);
    expect(r2.downloaded).toEqual(["jira"]);
    srv.resetCounters();
    const r3 = await runWake(c);
    expect(lines(srv)).toEqual([`GET ${API}/index`]);
    expect(r3.downloaded).toEqual([]);
  });
});

describe("CA3 usb", () => {
  it("baja las tres vistas", async () => {
    const r = await runWake(cfg(srv.url, store, { power: "usb" }));
    expect(r.downloaded).toEqual(["todo", "agenda", "jira"]);
    for (const id of ["todo", "agenda", "jira"]) {
      expect(viewFiles(store, id).sort()).toEqual(["meta.json", "raw1", "zones.json"]);
    }
  });
});

describe("CA4 una conexión, una petición a la vez", () => {
  it("en cada despertada", async () => {
    const c = cfg(srv.url, store, { power: "battery", extraViewsPerWake: 1 });
    for (let i = 0; i < 3; i++) {
      srv.resetCounters();
      const r = await runWake(c);
      expect(r.connections, `despertada ${i + 1}`).toBe(1);
      expect(srv.connections, `servidor, despertada ${i + 1}`).toBe(1);
      expect(srv.maxConcurrent).toBe(1);
    }
    srv.resetCounters();
    const u = await runWake(cfg(srv.url, tmpStoreAlso(), { power: "usb" }));
    expect(u.connections).toBe(1);
    expect(srv.connections).toBe(1);
    expect(srv.maxConcurrent).toBe(1);
  });
});

const extraStores: string[] = [];
function tmpStoreAlso(): string {
  const s = tmpStore();
  extraStores.push(s);
  return s;
}
afterEach(() => {
  for (const s of extraStores.splice(0)) rmStore(s);
});

describe("CA5 cabeceras obligatorias", () => {
  it("todas las peticiones (también POST log) las llevan y validan", async () => {
    srv.corruptImages.add("agenda"); // fuerza un POST /log
    await runWake(
      cfg(srv.url, store, { power: "battery", batteryMv: 3700, rssi: -60, firmware: "emu-test-1" }),
    );
    expect(srv.log.some((l) => l.method === "POST")).toBe(true);
    expect(srv.log.length).toBeGreaterThan(3);
    for (const l of srv.log) {
      const h = headersOf(l);
      const v = validateDeviceHeaders(h);
      expect(v.ok, `${l.method} ${l.path}`).toBe(true);
      expect(h["tintero-protocol"]).toBe("1");
      expect(h["tintero-firmware"]).toBe("emu-test-1");
      expect(h["tintero-power"]).toBe("battery");
      expect(h["tintero-formats"]).toBe("raw1");
      expect(h["tintero-panel"]).toBe("w=800,h=480,dpi=124,depth=1");
      expect(h["tintero-battery-mv"]).toBe("3700");
      expect(h["tintero-rssi"]).toBe("-60");
    }
  });
  it("sin batería ni RSSI no manda esas cabeceras; firmware por defecto", async () => {
    await runWake(cfg(srv.url, store, { power: "usb" }));
    for (const l of srv.log) {
      const h = headersOf(l);
      expect(validateDeviceHeaders(h).ok).toBe(true);
      expect(h["tintero-battery-mv"]).toBeUndefined();
      expect(h["tintero-rssi"]).toBeUndefined();
      expect(h["tintero-firmware"]).toBe("emulator-0.1.0");
      expect(h["tintero-panel"]).toBe("w=800,h=480,dpi=124,depth=1");
    }
  });
});

describe("CA6 CRC no coincide", () => {
  it("agenda no se guarda, se registra, y se reintenta", async () => {
    srv.corruptImages.add("agenda");
    const c = cfg(srv.url, store, { power: "usb" });
    const r = await runWake(c);
    expect(r.errors).toContainEqual({ code: "crc_mismatch", view: "agenda" });
    expect(r.downloaded).not.toContain("agenda");
    expect(viewFiles(store, "agenda")).toEqual([]);
    const posts = srv.log.filter((l) => l.method === "POST" && l.path === `${API}/log`);
    expect(posts).toHaveLength(1);
    const lr = validateLogRequest(posts[0]?.body ?? "");
    expect(lr.ok).toBe(true);
    if (lr.ok) {
      expect(lr.value.entries.length).toBeLessThanOrEqual(10);
      for (const e of lr.value.entries) {
        expect(["error", "warn"]).toContain(e.level);
        expect(e.msg.length).toBeLessThanOrEqual(200);
      }
    }
    srv.corruptImages.clear();
    srv.resetCounters();
    const r2 = await runWake(c);
    expect(lines(srv)).toContain(`GET ${API}/views/agenda/image`);
    expect(r2.downloaded).toContain("agenda");
  });
});

describe("CA7 409 stale_view", () => {
  it("un 409: un GET index extra y la descarga sigue", async () => {
    srv.stale409 = 1;
    const r = await runWake(cfg(srv.url, store, { power: "usb" }));
    expect(lines(srv).filter((l) => l === `GET ${API}/index`)).toHaveLength(2);
    expect(lines(srv).slice(0, 3)).toEqual([
      `GET ${API}/index`,
      `GET ${API}/views/todo/image`,
      `GET ${API}/index`,
    ]);
    expect(r.downloaded).toEqual(["todo", "agenda", "jira"]);
    expect(r.errors.map((e) => e.code)).not.toContain("stale_view");
  });
  it("409 repetido: termina con stale_view", async () => {
    srv.stale409 = Infinity;
    const r = await runWake(cfg(srv.url, store, { power: "usb" }));
    expect(lines(srv).filter((l) => l === `GET ${API}/index`)).toHaveLength(2);
    expect(lines(srv).filter((l) => l.endsWith("/image"))).toHaveLength(2);
    expect(r.errors.map((e) => e.code)).toContain("stale_view");
    expect(r.downloaded).toEqual([]);
  });
});

describe("CA8 panel distinto", () => {
  it("solo GET index (+ POST log); pantalla igual", async () => {
    const c = cfg(srv.url, store, { power: "usb" });
    await runWake(c);
    const before = readStoreFile(store, "screen.raw1");
    srv.indexPanel = { w: 648, h: 480, dpi: 124, depth: 1 };
    srv.nextWakeS = 900;
    srv.bump("todo", "aaaa1111");
    srv.resetCounters();
    const r = await runWake(c);
    expect(r.errors.map((e) => e.code)).toContain("panel_mismatch");
    expect(r.errors.map((e) => e.code)).not.toContain("index_invalid");
    const ls = lines(srv);
    expect(ls[0]).toBe(`GET ${API}/index`);
    expect(ls.slice(1).every((l) => l === `POST ${API}/log`)).toBe(true);
    expect(r.downloaded).toEqual([]);
    expect(r.nextWakeS).toBe(900);
    expect(readStoreFile(store, "screen.raw1").equals(before)).toBe(true);
  });
});

describe("CA9 topes de tamaño", () => {
  it("índice de 3000 bytes: too_large, nada se descarga", async () => {
    srv.indexPadding = 3000;
    expect(srv.indexJson().length).toBeGreaterThan(3000);
    const r = await runWake(cfg(srv.url, store, { power: "usb" }));
    expect(r.errors.map((e) => e.code)).toContain("too_large");
    const ls = lines(srv);
    expect(ls[0]).toBe(`GET ${API}/index`);
    expect(ls.slice(1).every((l) => l === `POST ${API}/log`)).toBe(true);
    expect(r.downloaded).toEqual([]);
    expect(r.nextWakeS).toBe(300);
  });
  it("imagen que pasa sus bytes declarados: too_large y no se guarda", async () => {
    srv.extraImageBytes.set("jira", 10);
    const r = await runWake(cfg(srv.url, store, { power: "usb" }));
    expect(r.errors).toContainEqual({ code: "too_large", view: "jira" });
    expect(viewFiles(store, "jira")).toEqual([]);
    expect(r.downloaded).not.toContain("jira");
  });
});

describe("CA10 servidor apagado", () => {
  it("network, nextWakeS 300, pantalla y flash sin cambios", async () => {
    const c = cfg(srv.url, store, { power: "usb" });
    await runWake(c);
    const before = snapshot(store);
    await srv.stop();
    const r = await runWake(c);
    expect(r.errors.map((e) => e.code)).toContain("network");
    expect(r.nextWakeS).toBe(300);
    expect(snapshot(store)).toEqual(before);
  });
});

describe("CA11 pantalla", () => {
  it("screen.raw1 es la imagen de todo; screen.png válido y con bits invertidos", async () => {
    await runWake(cfg(srv.url, store, { power: "usb" }));
    const todo = srv.views[0]?.image ?? Buffer.alloc(0);
    const raw = readStoreFile(store, "screen.raw1");
    expect(raw.equals(todo)).toBe(true);
    const png = readStoreFile(store, "screen.png");
    expect(checkImage("png1", png, PANEL).ok).toBe(true);
    const { w, h, rows } = decodePng1(png);
    expect([w, h]).toEqual([800, 480]);
    expect(pixel(todo, 5, 5)).toBe(true); // negro en raw1
    expect(pngBit(rows, w, 5, 5)).toBe(0); // negro en PNG
    expect(pixel(todo, 5, 300)).toBe(false);
    expect(pngBit(rows, w, 5, 300)).toBe(1); // blanco en PNG
    for (let i = 0; i < 48000; i += 997) {
      expect(rows[i]).toBe(~(todo[i] ?? 0) & 0xff);
    }
  });
});

describe("CA17 tope de flash", () => {
  it("con 100000 bytes: quedan todo y agenda; jira da flash_full", async () => {
    let max = 0;
    const timer = setInterval(() => {
      max = Math.max(max, flashUsed(store));
    }, 1);
    let r;
    try {
      r = await runWake(cfg(srv.url, store, { power: "usb", flashBytes: 100_000 }));
    } finally {
      clearInterval(timer);
    }
    max = Math.max(max, flashUsed(store));
    expect(max).toBeLessThanOrEqual(100_000);
    expect(viewFiles(store, "todo")).toHaveLength(3);
    expect(viewFiles(store, "agenda")).toHaveLength(3);
    expect(viewFiles(store, "jira")).toEqual([]);
    expect(r.errors).toContainEqual({ code: "flash_full", view: "jira" });
  });
});

describe("CA18 vista que desaparece", () => {
  it("se borran sus tres archivos en la despertada siguiente", async () => {
    const c = cfg(srv.url, store, { power: "usb" });
    await runWake(c);
    expect(viewFiles(store, "jira")).toHaveLength(3);
    srv.views = srv.views.filter((v) => v.id !== "jira");
    await runWake(c);
    expect(viewFiles(store, "jira")).toEqual([]);
    expect(storeHas(store, "views/jira.raw1")).toBe(false);
    expect(viewFiles(store, "todo")).toHaveLength(3);
  });
});
