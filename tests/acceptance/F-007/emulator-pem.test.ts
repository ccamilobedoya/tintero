import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT, rmDir, runEmulator, tmpDir } from "./helpers.ts";

let dir: string;
let small: string;
beforeAll(() => {
  dir = tmpDir();
  small = join(dir, "small.pem");
  writeFileSync(small, "-----BEGIN X-----\nAAAA\n-----END X-----\n");
});
afterAll(() => {
  rmDir(dir);
});

const SERVER = ["--server", "https://localhost:9"];

describe("CA1 el emulador lee los PEM con tope al arrancar", () => {
  it("--cert de 65 537 bytes → sale con 2, nombra --cert y no intenta conectarse (<2 s)", async () => {
    const big = join(dir, "big.pem");
    writeFileSync(big, Buffer.alloc(65_537, 0x41));
    const r = await runEmulator([...SERVER, "--ca", small, "--cert", big, "--key", small]);
    expect(r.code).toBe(2);
    expect(r.text).toContain("--cert");
    expect(r.ms).toBeLessThan(2000);
  });

  it("--ca que no existe → sale con 2 y nombra --ca", async () => {
    const r = await runEmulator([
      ...SERVER,
      "--ca",
      join(dir, "missing.pem"),
      "--cert",
      small,
      "--key",
      small,
    ]);
    expect(r.code).toBe(2);
    expect(r.text).toContain("--ca");
    expect(r.ms).toBeLessThan(2000);
  });

  it("--key que es una carpeta → sale con 2 y nombra --key", async () => {
    const folder = join(dir, "folder");
    mkdirSync(folder);
    const r = await runEmulator([...SERVER, "--ca", small, "--cert", small, "--key", folder]);
    expect(r.code).toBe(2);
    expect(r.text).toContain("--key");
    expect(r.ms).toBeLessThan(2000);
  });
});

describe("CA2 http.ts del emulador sin lecturas sin tope", () => {
  it("no aparecen readFileSync ni readFile", () => {
    const src = readFileSync(join(ROOT, "emulator/src/http.ts"), "utf8");
    expect(src).not.toMatch(/readFileSync/);
    expect(src).not.toMatch(/readFile/);
  });
});
