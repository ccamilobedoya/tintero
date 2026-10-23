import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkImage, validateActionsRequest } from "../../../contract/src/index.ts";
import { press, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { cfg } from "./helpers.ts";
import {
  PANEL,
  TestServer,
  readStoreFile,
  reqLine,
  rmStore,
  storeJson,
  tmpStore,
  viewFiles,
  withFocus,
} from "./testserver.ts";

const API = "/api/v1";
let srv: TestServer;
let store: string;
let c: EmulatorConfig;

beforeEach(async () => {
  srv = new TestServer();
  await srv.start();
  store = tmpStore();
});
afterEach(async () => {
  await srv.stop();
  rmStore(store);
});

async function ready(over: Partial<EmulatorConfig> = {}): Promise<void> {
  c = cfg(srv.url, store, { power: "usb", ...over });
  await runWake(c);
  srv.resetCounters();
}

const img = (id: string): Uint8Array =>
  srv.views.find((v) => v.id === id)?.image ?? new Uint8Array();
const zone = (view: string, id: string) => {
  const z = srv.views.find((v) => v.id === view)?.zones.find((x) => x.id === id);
  if (!z) throw new Error("zone");
  return z;
};
const screen = (): Uint8Array => readStoreFile(store, "screen.raw1");
const lines = (): string[] => srv.log.map(reqLine);

describe("CA12 tab", () => {
  it("recorre t1 → t2 → ev1 → t1, sin red, con marco de 3 px", async () => {
    await ready();
    const expectedFocus = ["t1", "t2", "ev1", "t1"];
    for (const [i, id] of expectedFocus.entries()) {
      const r = await press(c, "tab");
      expect(r.key).toBe("tab");
      expect(r.focus, `tab ${i + 1}`).toBe(id);
      expect(r.requests).toEqual([]);
      expect(r.current).toBe("todo");
      expect(
        Buffer.from(screen()).equals(Buffer.from(withFocus(img("todo"), zone("todo", id)))),
      ).toBe(true);
      expect(checkImage("png1", readStoreFile(store, "screen.png"), PANEL).ok).toBe(true);
      const st = storeJson(store, "state.json") as { current: string; focus: string };
      expect(st).toEqual({ current: "todo", focus: id });
    }
    expect(srv.log).toEqual([]);
  });
  it("el marco invierte exactamente los píxeles a < 3 px del borde de t1", async () => {
    await ready();
    await press(c, "tab");
    const a = Buffer.from(img("todo"));
    const b = Buffer.from(screen());
    let changed = 0;
    for (let y = 0; y < 480; y++) {
      for (let x = 0; x < 800; x++) {
        const bitA = ((a[y * 100 + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        const bitB = ((b[y * 100 + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
        const inRect = x >= 24 && x < 776 && y >= 72 && y < 112;
        const inFrame = inRect && (x < 27 || x >= 773 || y < 75 || y >= 109);
        expect(bitA !== bitB, `(${x},${y})`).toBe(inFrame);
        if (bitA !== bitB) changed++;
      }
    }
    expect(changed).toBe(752 * 40 - 746 * 34);
  });
});

describe("CA13 long-tab", () => {
  it("con agenda guardada: sin red, foco null; con jira sin guardar: solo imagen y zonas", async () => {
    await ready({ power: "battery", extraViewsPerWake: 1 });
    expect(viewFiles(store, "jira")).toEqual([]);
    await press(c, "tab");
    const r1 = await press(c, "long-tab");
    expect(r1.current).toBe("agenda");
    expect(r1.focus).toBeNull();
    expect(r1.requests).toEqual([]);
    expect(srv.log).toEqual([]);
    expect(Buffer.from(screen()).equals(Buffer.from(img("agenda")))).toBe(true);

    const r2 = await press(c, "long-tab");
    expect(r2.current).toBe("jira");
    expect(r2.focus).toBeNull();
    expect(lines()).toEqual([`GET ${API}/views/jira/image`, `GET ${API}/views/jira/zones`]);
    expect(r2.requests.map((q) => q.path.split("?")[0])).toEqual([
      `${API}/views/jira/image`,
      `${API}/views/jira/zones`,
    ]);
    expect(viewFiles(store, "jira")).toHaveLength(3);
    expect(Buffer.from(screen()).equals(Buffer.from(img("jira")))).toBe(true);
  });
});

async function toZone(id: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    const r = await press(c, "tab");
    if (r.focus === id) return;
  }
  throw new Error("zone not reached");
}

describe("CA14 ok sobre una zona", () => {
  it("manda la acción de t2 con id de 12 y at entero", async () => {
    await ready();
    await toZone("t2");
    srv.resetCounters();
    const r = await press(c, "ok");
    expect(lines()).toEqual([`POST ${API}/actions`]);
    expect(r.requests.map((q) => q.method)).toEqual(["POST"]);
    const v = validateActionsRequest(srv.log[0]?.body ?? "");
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.actions).toHaveLength(1);
      const a = v.value.actions[0];
      expect(a).toMatchObject({ view: "todo", zone: "t2", act: "toggle" });
      expect(a?.id).toMatch(/^[a-z0-9]{12}$/);
      expect(Number.isInteger(a?.at)).toBe(true);
    }
  });
  it("index_changed con huella de todo cambiada: índice, imagen y zonas", async () => {
    await ready();
    await toZone("t2");
    srv.indexChanged = true;
    srv.bump("todo", "bbbb2222");
    srv.resetCounters();
    const r = await press(c, "ok");
    expect(lines()).toEqual([
      `POST ${API}/actions`,
      `GET ${API}/index`,
      `GET ${API}/views/todo/image`,
      `GET ${API}/views/todo/zones`,
    ]);
    expect(srv.log[2]?.path).toBe(`${API}/views/todo/image?h=bbbb2222`);
    expect(r.requests).toHaveLength(4);
    expect(Buffer.from(screen()).length).toBe(48000);
  });
  it("index_changed con huella igual: solo el índice", async () => {
    await ready();
    await toZone("t2");
    srv.indexChanged = true;
    srv.resetCounters();
    await press(c, "ok");
    expect(lines()).toEqual([`POST ${API}/actions`, `GET ${API}/index`]);
  });
});

describe("CA15 acción sin red", () => {
  for (const status of ["applied", "duplicate"] as const) {
    it(`queda en queue.json y sale en la despertada siguiente antes de descargar (${status})`, async () => {
      await ready();
      await toZone("t2");
      await srv.stop();
      const r = await press(c, "ok");
      expect(r.errors.map((e) => e.code)).toContain("network");
      const q = readStoreFile(store, "queue.json").toString("utf8");
      const id = /"id"\s*:\s*"([a-z0-9]{12})"/.exec(q)?.[1];
      expect(id).toBeDefined();

      await srv.start();
      srv.actionStatus = status;
      srv.bump("agenda", "cccc3333"); // fuerza una descarga
      srv.resetCounters();
      await runWake(c);
      const ls = lines();
      const post = ls.indexOf(`POST ${API}/actions`);
      const firstGet = ls.findIndex((l) => l.endsWith("/image") || l.endsWith("/zones"));
      expect(post).toBeGreaterThan(-1);
      expect(firstGet).toBeGreaterThan(-1);
      expect(post).toBeLessThan(firstGet);
      const body = validateActionsRequest(srv.log[post]?.body ?? "");
      expect(body.ok && body.value.actions.map((a) => a.id)).toEqual([id]);

      srv.resetCounters();
      await runWake(c);
      expect(lines()).not.toContain(`POST ${API}/actions`);
    });
  }
});

describe("CA16 detalle y volver", () => {
  it("ok sobre ev1 muestra el detalle; long-ok vuelve sin red; long-ok en todo despierta", async () => {
    srv.openGoesToDetail = true;
    await ready();
    await toZone("ev1");
    srv.resetCounters();
    const r = await press(c, "ok");
    expect(r.current).toBe("detalle");
    expect(lines()[0]).toBe(`POST ${API}/actions`);
    expect(Buffer.from(screen()).equals(Buffer.from(img("detalle")))).toBe(true);
    expect(checkImage("png1", readStoreFile(store, "screen.png"), PANEL).ok).toBe(true);

    srv.resetCounters();
    const back = await press(c, "long-ok");
    expect(back.current).toBe("todo");
    expect(back.requests).toEqual([]);
    expect(srv.log).toEqual([]);
    expect(Buffer.from(screen()).equals(Buffer.from(img("todo")))).toBe(true);

    srv.current = "todo";
    srv.resetCounters();
    const refresh = await press(c, "long-ok");
    expect(srv.log.length).toBeGreaterThan(0);
    expect(lines()[0]).toBe(`GET ${API}/index`);
    expect(refresh.requests[0]?.path).toBe(`${API}/index`);
    expect(refresh.current).toBe("todo");
  });
});
