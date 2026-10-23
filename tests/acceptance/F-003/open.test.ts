import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultConfig, press, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { validateIndex } from "../../../contract/src/index.ts";
import { startServer } from "../../../server/src/index.ts";
import { API, CFG, devHeaders, getLocal, rmDir, tmpDir } from "./helpers.ts";

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

describe("CA6 abrir y volver", () => {
  it("press(ok) sobre abrir → current = detalle; press(long-ok) vuelve a demo sin peticiones", async () => {
    await runWake(usb());
    let focus: string | null = null;
    for (let i = 0; i < 6 && focus !== "abrir"; i++) focus = (await press(usb(), "tab")).focus;
    expect(focus).toBe("abrir");

    const opened = await press(usb(), "ok");
    expect(opened.errors).toEqual([]);
    expect(opened.current).toBe("detalle");

    const r = await getLocal(srv.url, `${API}/index`, { headers: devHeaders() });
    const v = validateIndex(r.text);
    expect(v.ok && v.value.current).toBe("detalle");
    const detalle = v.ok ? v.value.views.find((x) => x.id === "detalle") : undefined;
    expect(detalle).toBeDefined();
    const img = await getLocal(srv.url, `${API}/views/detalle/image?h=${detalle?.hash}`, {
      headers: devHeaders(),
    });
    // el emulador la muestra
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- temp test store
    const screen = readFileSync(join(store, "screen.raw1"));
    expect(screen.equals(img.buf)).toBe(true);

    const back = await press(usb(), "long-ok");
    expect(back.current).toBe("demo");
    expect(back.requests).toEqual([]);
  });
});
