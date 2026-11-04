/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeServer } from "./fake-server.ts";
import { defaultConfig, runWake } from "./index.ts";

let server: FakeServer;
let store: string;

beforeEach(async () => {
  server = new FakeServer();
  await server.start();
  store = await mkdtemp(join(tmpdir(), "tintero-emu-pb1-"));
});
afterEach(async () => {
  await server.stop();
  await rm(store, { recursive: true, force: true });
});

describe("pb1 (F-019)", () => {
  it("shows the same screen as with raw1", async () => {
    await runWake(defaultConfig(server.url, store));
    const expected = await readFile(join(store, "screen.raw1"));

    const other = await mkdtemp(join(tmpdir(), "tintero-emu-pb1-"));
    try {
      server.packed = true;
      const config = {
        ...defaultConfig(server.url, other),
        formats: ["pb1" as const, "raw1" as const],
      };
      const wake = await runWake(config);
      expect(wake.errors).toEqual([]);
      expect(server.seen.some((seen) => seen.headers["tintero-formats"] === "pb1,raw1")).toBe(true);
      const got = await readFile(join(other, "screen.raw1"));
      expect(got.equals(expected)).toBe(true);
      expect(
        (await readFile(join(other, "screen.png"))).equals(
          await readFile(join(store, "screen.png")),
        ),
      ).toBe(true);
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });

  it("reports a corrupt pb1 body as a bad image", async () => {
    server.packed = true;
    server.tamper.add("todo"); // flips a byte of the raw image before it is packed → crc mismatch
    const config = {
      ...defaultConfig(server.url, store),
      formats: ["pb1" as const, "raw1" as const],
    };
    const wake = await runWake(config);
    expect(wake.errors.length).toBeGreaterThan(0);
  });
});
