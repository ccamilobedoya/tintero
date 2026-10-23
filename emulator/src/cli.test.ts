/* eslint-disable security/detect-non-literal-fs-filename -- temp files of the test */
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { FakeServer } from "./fake-server.ts";

const run = promisify(execFile);
const CLI = join(import.meta.dirname, "cli.ts");

let server: FakeServer;
let store: string;
beforeEach(async () => {
  server = new FakeServer();
  await server.start();
  store = await mkdtemp(join(tmpdir(), "tintero-cli-"));
});
afterEach(async () => {
  await server.stop();
  await rm(store, { recursive: true, force: true });
});

async function cli(args: string[]): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await main(
    args,
    (line) => out.push(line),
    (line) => err.push(line),
  );
  return { code, out, err };
}

describe("cli PEM files (CA1)", () => {
  it("exits 2 naming the option, without connecting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "tintero-pem-"));
    try {
      const big = join(dir, "big.pem");
      const ok = join(dir, "ok.pem");
      await writeFile(big, Buffer.alloc(65_537, 1));
      await writeFile(ok, "x");
      const base = ["--server", "https://localhost:9", "--store", store];
      const cases: [string[], string][] = [
        [["--ca", ok, "--cert", big, "--key", ok], "--cert"],
        [["--ca", join(dir, "none"), "--cert", ok, "--key", ok], "--ca"],
        [["--ca", ok, "--cert", ok, "--key", dir], "--key"],
      ];
      for (const [args, option] of cases) {
        const started = Date.now();
        const result = await cli([...base, ...args]);
        expect(result.code).toBe(2);
        expect(result.err.join("\n")).toContain(option);
        expect(Date.now() - started).toBeLessThan(2000);
        expect(result.out).toEqual([]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("cli", () => {
  it("prints one JSON per wake and per key (CA20)", async () => {
    const result = await cli([
      "--server",
      server.url,
      "--store",
      store,
      "--wakes",
      "2",
      "--power",
      "usb",
      "--keys",
      "tab,tab",
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toHaveLength(4);
    const lines = result.out.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(Object.keys(lines[0] ?? {}).sort()).toEqual(
      ["connections", "current", "downloaded", "errors", "nextWakeS", "requests"].sort(),
    );
    expect(lines[0]?.downloaded).toEqual(["todo", "agenda", "jira"]);
    expect(lines[2]).toMatchObject({ key: "tab", focus: "t1" });
    expect(lines[3]).toMatchObject({ key: "tab", focus: "t2" });
  });

  it("exits 2 with usage on bad options (CA20)", async () => {
    for (const args of [
      ["--server", server.url, "--nope"],
      [],
      ["--server", "ftp://example.test"],
      ["--server", server.url, "--power", "solar"],
      ["--server", server.url, "--keys", "tab,jump"],
      ["--server", server.url, "--panel", "w=1"],
      ["--server", server.url, "--wakes", "x"],
      ["--server", server.url, "stray"],
    ]) {
      const result = await cli(args);
      expect(result.code).toBe(2);
      expect(result.err.join("\n")).toContain("usage:");
    }
  });

  it("runs as a script and exits with the right codes", async () => {
    const ok = await run("node", [CLI, "--server", server.url, "--store", store]);
    expect((JSON.parse(ok.stdout.trim()) as { current: string }).current).toBe("todo");
    await expect(run("node", [CLI, "--unknown"])).rejects.toMatchObject({ code: 2 });
  });
});
