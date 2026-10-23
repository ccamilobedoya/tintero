import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installFiles } from "../../../server/scripts/pki.ts";
import { rmDir, tmpDir } from "./helpers.ts";

let dir: string;
beforeAll(() => {
  dir = tmpDir();
});
afterAll(() => {
  rmDir(dir);
});

describe("CA4 installFiles sin restos", () => {
  it("el from del segundo no existe → rechaza y ningún to existe", async () => {
    const a = join(dir, "a.src");
    writeFileSync(a, "a");
    const toA = join(dir, "bad-a.out");
    const toB = join(dir, "bad-b.out");
    await expect(
      installFiles([
        { from: a, to: toA, mode: 0o600 },
        { from: join(dir, "nope.src"), to: toB, mode: 0o644 },
      ]),
    ).rejects.toThrow();
    expect(existsSync(toA)).toBe(false);
    expect(existsSync(toB)).toBe(false);
  });

  it("con los dos from válidos instala ambos con sus modos", async () => {
    const a = join(dir, "ok-a.src");
    const b = join(dir, "ok-b.src");
    writeFileSync(a, "aaa");
    writeFileSync(b, "bbb");
    const toA = join(dir, "ok-a.out");
    const toB = join(dir, "ok-b.out");
    await installFiles([
      { from: a, to: toA, mode: 0o600 },
      { from: b, to: toB, mode: 0o644 },
    ]);
    expect(statSync(toA).mode & 0o777).toBe(0o600);
    expect(statSync(toB).mode & 0o777).toBe(0o644);
  });
});
