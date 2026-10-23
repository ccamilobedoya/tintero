import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, press, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { validateActionsResponse, type ActionsResponse } from "../../../contract/src/index.ts";
import { startServer } from "../../../server/src/index.ts";
import {
  API,
  CFG,
  PANEL,
  devHeaders,
  getLocal,
  isBlack,
  rectAll,
  rmDir,
  tmpDir,
} from "./helpers.ts";

let srv: Awaited<ReturnType<typeof startServer>>;
let store: string;

beforeEach(async () => {
  srv = await startServer(CFG, 0);
  store = tmpDir("tintero-f003-");
});
afterEach(async () => {
  await srv.close();
  rmDir(store);
});

const usb = (): EmulatorConfig => ({ ...defaultConfig(srv.url, store), power: "usb" });
const readStore = (name: string): Buffer =>
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
  readFileSync(join(store, name));

async function demoHash(): Promise<string> {
  const r = await getLocal(srv.url, `${API}/index`, { headers: devHeaders() });
  const idx = JSON.parse(r.text) as { views: { id: string; hash: string }[] };
  const h = idx.views.find((v) => v.id === "demo")?.hash;
  if (!h) throw new Error("no demo");
  return h;
}

async function postAction(
  id: string,
  zone: string,
  act: string,
  view = "demo",
): Promise<ActionsResponse> {
  const r = await getLocal(srv.url, `${API}/actions`, {
    method: "POST",
    headers: { ...devHeaders(), "content-type": "application/json" },
    body: JSON.stringify({ actions: [{ id, view, zone, act, at: 1 }] }),
  });
  expect(r.status).toBe(200);
  const v = validateActionsResponse(r.text);
  if (!v.ok) throw new Error(`invalid ActionsResponse: ${r.text}`);
  return v.value;
}

const C2 = { x: 20, y: 100, w: 120, h: 40 };

describe("CA5 toggle", () => {
  it("press(ok) sobre c2: cambia la huella y la nueva imagen trae c2 rellena de negro", async () => {
    await runWake(usb());
    const h0 = await demoHash();
    const before = readStore("views/demo.raw1");
    expect(
      rectAll(before, 800, { x: C2.x + 2, y: C2.y + 2, w: C2.w - 4, h: C2.h - 4 }, false),
    ).toBe(true);

    let focus: string | null = null;
    for (let i = 0; i < 6 && focus !== "c2"; i++) focus = (await press(usb(), "tab")).focus;
    expect(focus).toBe("c2");
    const rep = await press(usb(), "ok");
    expect(rep.errors).toEqual([]);
    expect(
      rep.requests.some((q) => q.method === "POST" && q.path.startsWith(`${API}/actions`)),
    ).toBe(true);

    const h1 = await demoHash();
    expect(h1).not.toBe(h0);
    const after = readStore("views/demo.raw1");
    expect(rectAll(after, 800, { x: C2.x + 2, y: C2.y + 2, w: C2.w - 4, h: C2.h - 4 }, true)).toBe(
      true,
    );
    // c1 y c3 siguen sin marcar
    expect(isBlack(after, 800, 80, 60)).toBe(false);
    expect(isBlack(after, 800, 80, 180)).toBe(false);
    const served = await getLocal(srv.url, `${API}/views/demo/image?h=${h1}`, {
      headers: devHeaders(PANEL),
    });
    expect(served.buf.equals(after)).toBe(true);
  });

  it("acción directa: applied + index_changed; el mismo id otra vez → duplicate sin cambiar la huella", async () => {
    const h0 = await demoHash();
    const first = await postAction("dup-test-0001", "c2", "toggle");
    expect(first.results).toEqual([{ id: "dup-test-0001", status: "applied" }]);
    expect(first.index_changed).toBe(true);
    const h1 = await demoHash();
    expect(h1).not.toBe(h0);
    const second = await postAction("dup-test-0001", "c2", "toggle");
    expect(second.results).toEqual([{ id: "dup-test-0001", status: "duplicate" }]);
    expect(second.index_changed).toBe(false);
    expect(await demoHash()).toBe(h1);
  });

  it("toggle con otro id devuelve la casilla a su estado: la huella vuelve a h0", async () => {
    const h0 = await demoHash();
    await postAction("tog-aaaa-0001", "c3", "toggle");
    await postAction("tog-aaaa-0002", "c3", "toggle");
    expect(await demoHash()).toBe(h0);
  });

  it("combinaciones inexistentes o no permitidas → stale, sin cambios", async () => {
    const h0 = await demoHash();
    for (const [i, [view, zone, act]] of (
      [
        ["demo", "c9", "toggle"],
        ["nada", "c1", "toggle"],
        ["demo", "abrir", "toggle"],
        ["demo", "c1", "open"],
        ["detalle", "c1", "toggle"],
      ] as const
    ).entries()) {
      const r = await postAction(`stale-test-000${i}`, zone, act, view);
      expect(r.results[0]?.status).toBe("stale");
      expect(r.index_changed).toBe(false);
    }
    expect(await demoHash()).toBe(h0);
  });

  it("recuerda los últimos 1000 ids y olvida los más viejos", async () => {
    const h0 = await demoHash();
    // 1001 toggles (odd): each applied once; the first id falls out of the memory
    for (let i = 0; i < 1001; i++) {
      const r = await postAction(`bulk-${String(i).padStart(6, "0")}`, "c1", "toggle");
      expect(r.results[0]?.status).toBe("applied");
    }
    const hOdd = await demoHash();
    expect(hOdd).not.toBe(h0);
    const recent = await postAction("bulk-001000", "c1", "toggle");
    expect(recent.results[0]?.status).toBe("duplicate");
    expect(await demoHash()).toBe(hOdd);
    const old = await postAction("bulk-000000", "c1", "toggle");
    expect(old.results[0]?.status).toBe("applied");
  }, 60_000);
});
