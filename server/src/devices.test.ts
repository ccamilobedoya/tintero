/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceList, MAX_DEVICES_BYTES, parseDevices } from "./devices.ts";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("parseDevices", () => {
  it("reads lines, skipping blanks and comments", () => {
    const map = parseDevices(`# comment\n\n${A} p1\n${B} p-2\n`);
    expect([...map]).toEqual([
      [A, "p1"],
      [B, "p-2"],
    ]);
  });

  it("rejects bad fingerprints, ids, spacing and duplicates", () => {
    expect(() => parseDevices(`${"a".repeat(63)} p1`)).toThrow();
    expect(() => parseDevices(`${A.toUpperCase()} p1`)).toThrow();
    expect(() => parseDevices(`${A} P1`)).toThrow();
    expect(() => parseDevices(`${A}  p1`)).toThrow();
    expect(() => parseDevices(`${A} ${"x".repeat(33)}`)).toThrow();
    expect(() => parseDevices(`${A} p1\n${B} p1`)).toThrow();
    expect(() => parseDevices(`${A} p1\n${A} p2`)).toThrow();
  });
});

describe("DeviceList", () => {
  let dir: string;
  let lines: string[];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tintero-dev-"));
    lines = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      lines.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rereads when the file changes and fails closed when it is invalid", () => {
    const file = join(dir, "devices.txt");
    writeFileSync(file, `${A} p1\n`);
    const list = new DeviceList(file);
    expect(list.lookup(A)).toBe("p1");
    writeFileSync(file, "");
    expect(list.lookup(A)).toBeUndefined();
    writeFileSync(file, `${A} p1\n${"b".repeat(63)} p2\n`);
    expect(list.lookup(A)).toBeUndefined();
    expect(list.lookup(A)).toBeUndefined();
    const errors = lines.filter((line) => line.includes("devices_error"));
    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toContain("p2");
    writeFileSync(file, `${A} p1\n`);
    expect(list.lookup(A)).toBe("p1");
  });

  it("rereads an edit with the same size and the same mtime (CA3)", () => {
    const file = join(dir, "devices.txt");
    const B = "b".repeat(64);
    writeFileSync(file, `${A} p1\n`);
    const before = statSync(file);
    const list = new DeviceList(file);
    expect(list.lookup(A)).toBe("p1");
    writeFileSync(file, `${B} p1\n`);
    utimesSync(file, before.atime, before.mtime);
    expect(statSync(file).size).toBe(before.size);
    expect(list.lookup(A)).toBeUndefined();
    expect(list.lookup(B)).toBe("p1");
  });

  it("treats a missing or oversized file as empty", () => {
    const file = join(dir, "devices.txt");
    const list = new DeviceList(file);
    expect(list.lookup(A)).toBeUndefined();
    writeFileSync(file, `${A} p1\n${"#".repeat(MAX_DEVICES_BYTES)}\n`);
    expect(list.lookup(A)).toBeUndefined();
    expect(lines.filter((line) => line.includes("devices_error"))).toHaveLength(2);
  });

  it("rereads 100 devices in under 5 ms", () => {
    const file = join(dir, "devices.txt");
    const text = Array.from(
      { length: 100 },
      (_, i) => `${i.toString(16).padStart(64, "0")} d${i}`,
    ).join("\n");
    writeFileSync(file, text);
    const list = new DeviceList(file);
    list.lookup(A);
    writeFileSync(file, `${text}\n`);
    const started = performance.now();
    list.lookup(A);
    expect(performance.now() - started).toBeLessThan(5);
  });
});
