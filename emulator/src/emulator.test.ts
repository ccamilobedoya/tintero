/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkImage, validateDeviceHeaders } from "../../contract/src/index.ts";
import { FakeServer, PANEL, pattern } from "./fake-server.ts";
import { defaultConfig, press, renderScreen, runWake, type EmulatorConfig } from "./index.ts";

let server: FakeServer;
let store: string;

beforeEach(async () => {
  server = new FakeServer();
  await server.start();
  store = await mkdtemp(join(tmpdir(), "tintero-emu-"));
});
afterEach(async () => {
  await server.stop();
  await rm(store, { recursive: true, force: true });
});

function config(overrides: Partial<EmulatorConfig> = {}): EmulatorConfig {
  return { ...defaultConfig(server.url, store), ...overrides };
}
const steps = (requests: { method: string; path: string }[]): string[] =>
  requests.map((request) => `${request.method} ${request.path.split("?")[0] ?? ""}`);
const file = (name: string): Promise<Buffer> => readFile(join(store, name));
const exists = (name: string): Promise<boolean> =>
  stat(join(store, name)).then(
    () => true,
    () => false,
  );

async function flashSize(): Promise<number> {
  let total = (await exists("queue.json")) ? (await stat(join(store, "queue.json"))).size : 0;
  for (const name of await readdir(join(store, "views"))) {
    total += (await stat(join(store, "views", name))).size;
  }
  return total;
}

describe("runWake", () => {
  it("downloads in order with a battery budget, one connection, valid headers (CA1-CA5)", async () => {
    const one = config({ extraViewsPerWake: 1 });
    const first = await runWake(one);
    expect(steps(first.requests)).toEqual([
      "GET /api/v1/index",
      "GET /api/v1/views/todo/image",
      "GET /api/v1/views/todo/zones",
      "GET /api/v1/views/agenda/image",
      "GET /api/v1/views/agenda/zones",
    ]);
    expect(first.requests[1]?.path).toBe(`/api/v1/views/todo/image?h=${server.hash("todo")}`);
    expect(first.downloaded).toEqual(["todo", "agenda"]);
    expect(first.current).toBe("todo");
    expect(first.nextWakeS).toBe(1800);
    expect(first.connections).toBe(1);

    const second = await runWake(one);
    expect(steps(second.requests)).toEqual([
      "GET /api/v1/index",
      "GET /api/v1/views/jira/image",
      "GET /api/v1/views/jira/zones",
    ]);
    expect(steps((await runWake(one)).requests)).toEqual(["GET /api/v1/index"]);

    expect(server.maxConcurrent).toBe(1);
    expect(server.connections).toBe(3); // one per wake
    for (const seen of server.seen) {
      const headers = Object.fromEntries(
        Object.entries(seen.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(",") : value,
        ]),
      );
      expect(validateDeviceHeaders(headers).ok).toBe(true);
      expect(headers["tintero-panel"]).toBe("w=800,h=480,dpi=124,depth=1");
    }
  });

  it("downloads everything on usb (CA3)", async () => {
    const report = await runWake(config({ power: "usb" }));
    expect(report.downloaded).toEqual(["todo", "agenda", "jira"]);
  });

  it("sends battery and rssi when known", async () => {
    await runWake(config({ batteryMv: 3700, rssi: -60 }));
    expect(server.seen[0]?.headers["tintero-battery-mv"]).toBe("3700");
    expect(server.seen[0]?.headers["tintero-rssi"]).toBe("-60");
  });

  it("does not store a corrupt image and asks for it again later (CA6)", async () => {
    server.tamper.add("agenda");
    const report = await runWake(config({ power: "usb" }));
    expect(report.errors).toContainEqual({ code: "crc_mismatch", view: "agenda" });
    expect(report.downloaded).toEqual(["todo", "jira"]);
    expect(await exists("views/agenda.raw1")).toBe(false);
    expect(steps(report.requests)).toContain("POST /api/v1/log");
    const log = server.seen.find((seen) => seen.path === "/api/v1/log");
    expect(JSON.parse(log?.body ?? "{}")).toEqual({
      entries: [
        { at: expect.any(Number) as number, level: "error", msg: "crc_mismatch view=agenda" },
      ],
    });
    server.tamper.clear();
    expect((await runWake(config({ power: "usb" }))).downloaded).toEqual(["agenda"]);
  });

  it("asks for the index again after one 409 and stops after a second (CA7)", async () => {
    server.staleLeft = 1;
    const report = await runWake(config({ power: "usb" }));
    expect(steps(report.requests).filter((step) => step === "GET /api/v1/index")).toHaveLength(2);
    expect(report.downloaded).toEqual(["todo", "agenda", "jira"]);

    await rm(join(store, "views"), { recursive: true });
    server.staleLeft = 2;
    const twice = await runWake(config({ power: "usb" }));
    expect(twice.errors).toContainEqual({ code: "stale_view", view: "todo" });
    expect(twice.downloaded).toEqual([]);
  });

  it("stops on a panel mismatch without touching the screen (CA8)", async () => {
    await runWake(config());
    const before = await file("screen.raw1");
    server.indexPanel = { w: 648, h: 480, dpi: 133, depth: 1 };
    for (const view of server.views.values()) view.raw1 = Buffer.alloc(38_880);
    const report = await runWake(config());
    expect(report.errors).toEqual([{ code: "panel_mismatch" }]);
    expect(steps(report.requests)).toEqual(["GET /api/v1/index", "POST /api/v1/log"]);
    expect(await file("screen.raw1")).toEqual(before);
  });

  it("rejects an oversize index and an oversize image (CA9)", async () => {
    server.indexOverride = `{"pad":"${"x".repeat(3000)}"}`;
    const big = await runWake(config());
    expect(big.errors[0]?.code).toBe("too_large");
    expect(big.nextWakeS).toBe(300);
    expect(big.requests.filter((request) => request.method === "GET")).toHaveLength(1);

    server.indexOverride = undefined;
    server.oversize.add("todo");
    const report = await runWake(config());
    expect(report.errors).toContainEqual({ code: "too_large", view: "todo" });
    expect(await exists("views/todo.raw1")).toBe(false);
  });

  it("keeps everything when the server is down (CA10)", async () => {
    await runWake(config());
    const screen = await file("screen.raw1");
    const before = await flashSize();
    await server.stop();
    const report = await runWake(config());
    expect(report.errors).toEqual([{ code: "network" }]);
    expect(report.nextWakeS).toBe(300);
    expect(report.requests[0]?.status).toBe("error");
    expect(await file("screen.raw1")).toEqual(screen);
    expect(await flashSize()).toBe(before);
    await server.start(); // so afterEach can stop it
  });

  it("shows the current view byte for byte and as a valid PNG (CA11)", async () => {
    await runWake(config());
    expect(await file("screen.raw1")).toEqual(pattern(0));
    const png = new Uint8Array(await file("screen.png"));
    expect(checkImage("png1", png, PANEL).ok).toBe(true);
    // The PNG row is filter byte + 100 bytes; pixel (0,0) is black in the raw1 -> bit 0 in the PNG.
    const { inflateSync } = await import("node:zlib");
    // 8 signature + 25 IHDR chunk + 8 IDAT header; the CRC and IEND (16 bytes) close the file.
    const rows = inflateSync(png.subarray(41, png.length - 16));
    expect((rows[1] ?? 0) >> 7).toBe(0); // black
    expect(((rows[1] ?? 0) >> 6) & 1).toBe(1); // white
  });

  it("keeps views under the flash cap (CA17)", async () => {
    const report = await runWake(config({ power: "usb", flashBytes: 100_000 }));
    expect(await flashSize()).toBeLessThanOrEqual(100_000);
    expect(report.downloaded).toEqual(["todo", "agenda"]);
    expect(report.errors).toContainEqual({ code: "flash_full", view: "jira" });
    expect(await exists("views/todo.raw1")).toBe(true);
  });

  it("forgets views that left the index (CA18)", async () => {
    await runWake(config({ power: "usb" }));
    server.views.delete("jira");
    await runWake(config({ power: "usb" }));
    for (const suffix of [".raw1", ".zones.json", ".meta.json"]) {
      expect(await exists(`views/jira${suffix}`)).toBe(false);
    }
    expect(await exists("views/agenda.raw1")).toBe(true);
  });

  it("sends queued actions before any download (CA15)", async () => {
    const action = { id: "abcdefghijkl", view: "todo", zone: "t1", act: "toggle", at: 1 };
    await writeFile(join(store, "queue.json"), JSON.stringify([action]));
    server.actionStatus = "duplicate";
    const report = await runWake(config());
    expect(steps(report.requests).slice(0, 2)).toEqual([
      "GET /api/v1/index",
      "POST /api/v1/actions",
    ]);
    expect(JSON.parse(server.seen[1]?.body ?? "{}")).toEqual({ actions: [action] });
    expect(await exists("queue.json")).toBe(false);
  });

  it("rejects a server that is not http or https", async () => {
    await expect(runWake(config({ server: "ftp://127.0.0.1:1" }))).rejects.toThrow();
  });
});

describe("press", () => {
  beforeEach(async () => {
    await runWake(config({ power: "usb" }));
  });

  it("moves the focus with tab and frames it (CA12)", async () => {
    const todo = pattern(0);
    const zone = { id: "t1", x: 24, y: 72, w: 752, h: 40, act: "toggle" as const };
    const reports = [];
    for (let i = 0; i < 4; i++) reports.push(await press(config(), "tab"));
    expect(reports.map((report) => report.focus)).toEqual(["t1", "t2", "ev1", "t1"]);
    expect(reports.every((report) => report.requests.length === 0)).toBe(true);
    expect(await file("screen.raw1")).toEqual(Buffer.from(renderScreen(todo, PANEL, zone)));
    // Pixel (24,72) is on the frame: it flipped; pixel (30,80) is inside the 3 px: it did not.
    const at = (raw: Uint8Array, x: number, y: number): number =>
      ((raw[y * 100 + (x >> 3)] ?? 0) >> (7 - (x & 7))) & 1;
    const screen = await file("screen.raw1");
    expect(at(screen, 24, 72)).not.toBe(at(todo, 24, 72));
    expect(at(screen, 40, 90)).toBe(at(todo, 40, 90));
    expect(at(screen, 23, 72)).toBe(at(todo, 23, 72));
    expect(JSON.parse((await file("state.json")).toString())).toEqual({
      current: "todo",
      focus: "t1",
    });
  });

  it("long-tab moves to the next view, downloading only when missing (CA13)", async () => {
    const agenda = await press(config(), "long-tab");
    expect(agenda).toMatchObject({ current: "agenda", focus: null, requests: [] });
    await rm(join(store, "views", "jira.meta.json"));
    await press(config(), "long-tab");
    const jira = await press(config(), "long-tab");
    expect(jira.current).toBe("todo"); // circular
  });

  it("long-tab downloads a view that is not stored (CA13)", async () => {
    await press(config(), "long-tab");
    await rm(join(store, "views", "jira.meta.json"));
    const report = await press(config(), "long-tab");
    expect(steps(report.requests)).toEqual([
      "GET /api/v1/views/jira/image",
      "GET /api/v1/views/jira/zones",
    ]);
    expect(report.current).toBe("jira");
  });

  it("ok sends the action of the focused zone (CA14)", async () => {
    await press(config(), "tab");
    await press(config(), "tab");
    server.seen = [];
    const report = await press(config(), "ok");
    expect(steps(report.requests)).toEqual(["POST /api/v1/actions"]);
    const body = JSON.parse(server.seen[0]?.body ?? "{}") as { actions: Record<string, unknown>[] };
    expect(body.actions).toHaveLength(1);
    expect(body.actions[0]).toMatchObject({ view: "todo", zone: "t2", act: "toggle" });
    expect(body.actions[0]?.id).toMatch(/^[a-z0-9]{12}$/);
    expect(Number.isInteger(body.actions[0]?.at)).toBe(true);
    expect(await exists("queue.json")).toBe(false);
  });

  it("ok redownloads the current view when the index changed (CA14)", async () => {
    await press(config(), "tab");
    server.indexChanged = true;
    server.views.set("todo", { ...(server.views.get("todo") ?? { zones: [] }), raw1: pattern(5) });
    const report = await press(config(), "ok");
    expect(steps(report.requests)).toEqual([
      "POST /api/v1/actions",
      "GET /api/v1/index",
      "GET /api/v1/views/todo/image",
      "GET /api/v1/views/todo/zones",
    ]);
    expect(report.focus).toBe("t1");
  });

  it("ok without network queues the action, and the next wake sends it first (CA15)", async () => {
    await press(config(), "tab");
    await server.stop();
    const report = await press(config(), "ok");
    expect(report.errors).toEqual([{ code: "network" }]);
    const queued = JSON.parse((await file("queue.json")).toString()) as { id: string }[];
    expect(queued).toHaveLength(1);
    await server.start();
    const wake = await runWake(config({ server: server.url }));
    expect(steps(wake.requests).slice(0, 2)).toEqual(["GET /api/v1/index", "POST /api/v1/actions"]);
    const sent = JSON.parse(
      server.seen.find((seen) => seen.path === "/api/v1/actions")?.body ?? "{}",
    ) as { actions: { id: string }[] };
    expect(sent.actions[0]?.id).toBe(queued[0]?.id);
    expect(await exists("queue.json")).toBe(false);
  });

  it("opens a detail and long-ok goes back without network (CA16)", async () => {
    await press(config(), "tab");
    await press(config(), "tab");
    await press(config(), "tab"); // ev1
    server.views.set("detail", { raw1: pattern(7), zones: [], parent: "todo" });
    server.onAction = () => {
      server.current = "detail";
    };
    server.indexChanged = true;
    const open = await press(config(), "ok");
    expect(open.current).toBe("detail");
    expect(await file("screen.raw1")).toEqual(pattern(7));
    server.seen = [];
    const back = await press(config(), "long-ok");
    expect(back).toMatchObject({ current: "todo", focus: null, requests: [] });
    expect(server.seen).toHaveLength(0);
    server.current = "todo";
    server.indexChanged = false;
    const refresh = await press(config(), "long-ok");
    expect(steps(refresh.requests)[0]).toBe("GET /api/v1/index");
  });
});
