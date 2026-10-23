import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jsonLines, runNpm, type CliLine } from "./helpers.ts";
import { TestServer, rmStore, storeHas, tmpStore } from "./testserver.ts";

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

function isWakeReport(o: CliLine): boolean {
  return (
    Array.isArray(o.requests) &&
    Array.isArray(o.downloaded) &&
    "current" in o &&
    typeof o.nextWakeS === "number" &&
    Array.isArray(o.errors) &&
    typeof o.connections === "number"
  );
}

describe("CA20 CLI", () => {
  it("--wakes 2 --power usb: 2 líneas JSON con forma de WakeReport y salida 0", async () => {
    const r = await runNpm("emulator", [
      "--server",
      srv.url,
      "--store",
      store,
      "--wakes",
      "2",
      "--power",
      "usb",
    ]);
    expect(r.code, r.stderr).toBe(0);
    const out = jsonLines(r.stdout);
    expect(out).toHaveLength(2);
    expect(out.every(isWakeReport)).toBe(true);
    expect(out[0]?.downloaded).toEqual(["todo", "agenda", "jira"]);
    expect(out[1]?.downloaded).toEqual([]);
    expect(storeHas(store, "screen.png")).toBe(true);
  }, 90_000);

  it("--keys tab,tab: además 2 PressReport", async () => {
    const r = await runNpm("emulator", [
      "--server",
      srv.url,
      "--store",
      store,
      "--power",
      "usb",
      "--keys",
      "tab,tab",
    ]);
    expect(r.code, r.stderr).toBe(0);
    const out = jsonLines(r.stdout);
    expect(out).toHaveLength(3);
    expect(isWakeReport(out[0] ?? {})).toBe(true);
    expect(out[1]).toMatchObject({ key: "tab", current: "todo", focus: "t1" });
    expect(out[2]).toMatchObject({ key: "tab", current: "todo", focus: "t2" });
    for (const p of out.slice(1)) {
      expect(Array.isArray(p.requests)).toBe(true);
      expect(Array.isArray(p.errors)).toBe(true);
    }
  }, 90_000);

  it("opción desconocida: salida 2 y uso en stderr", async () => {
    const r = await runNpm("emulator", ["--server", srv.url, "--store", store, "--bogus", "1"]);
    expect(r.code).toBe(2);
    expect(r.stderr.length).toBeGreaterThan(0);
    expect(srv.log).toEqual([]);
  }, 60_000);

  it("--server que no es http(s): salida 2", async () => {
    const r = await runNpm("emulator", ["--server", "ftp://127.0.0.1:1", "--store", store]);
    expect(r.code).toBe(2);
  }, 60_000);
});
