/* eslint-disable security/detect-non-literal-fs-filename -- temp files of the test */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readCapped } from "./capped.ts";

const dir = mkdtempSync(join(tmpdir(), "tintero-capped-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("readCapped", () => {
  it("reads a file at the cap", () => {
    const file = join(dir, "ok");
    writeFileSync(file, Buffer.alloc(10, 1));
    expect(readCapped(file, 10).length).toBe(10);
  });

  it("rejects a file over the cap, a folder and a missing file", () => {
    const file = join(dir, "big");
    writeFileSync(file, Buffer.alloc(11, 1));
    expect(() => readCapped(file, 10)).toThrow("too large");
    expect(() => readCapped(dir, 10)).toThrow("regular");
    expect(() => readCapped(join(dir, "none"), 10)).toThrow();
  });
});
