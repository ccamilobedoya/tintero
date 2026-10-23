/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fingerprint } from "../src/tls.ts";
import { installFiles, main, pkiDevice, pkiInit, pkiServer } from "./pki.ts";

const REPO = resolve(import.meta.dirname, "../..");
let base: string;
beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "tintero-pkitest-"));
});
afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const mode = (path: string): number => statSync(path).mode & 0o777;

describe("installFiles (CA4)", () => {
  it("leaves nothing behind when the second source is missing", async () => {
    const dir = join(base, "inst-fail");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.src"), "a");
    const files = [
      { from: join(dir, "a.src"), to: join(dir, "a.out"), mode: 0o600 },
      { from: join(dir, "missing"), to: join(dir, "b.out"), mode: 0o644 },
    ];
    await expect(installFiles(files)).rejects.toThrow();
    expect(existsSync(join(dir, "a.out"))).toBe(false);
    expect(existsSync(join(dir, "b.out"))).toBe(false);
  });

  it("installs both files with their modes and never touches an existing target", async () => {
    const dir = join(base, "inst-ok");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.src"), "a");
    writeFileSync(join(dir, "b.src"), "b");
    await installFiles([
      { from: join(dir, "a.src"), to: join(dir, "a.out"), mode: 0o600 },
      { from: join(dir, "b.src"), to: join(dir, "b.out"), mode: 0o644 },
    ]);
    expect(mode(join(dir, "a.out"))).toBe(0o600);
    expect(mode(join(dir, "b.out"))).toBe(0o644);
    writeFileSync(join(dir, "c.out"), "mine");
    await expect(
      installFiles([
        { from: join(dir, "a.src"), to: join(dir, "d.out"), mode: 0o600 },
        { from: join(dir, "b.src"), to: join(dir, "c.out"), mode: 0o600 },
      ]),
    ).rejects.toThrow();
    expect(existsSync(join(dir, "d.out"))).toBe(false);
    expect(readFileSync(join(dir, "c.out"), "utf8")).toBe("mine");
  });
});

describe("pki", () => {
  it("creates the CA, the server and a device with strict permissions (CA7)", async () => {
    const dir = join(base, "ok");
    await pkiInit(dir);
    await pkiServer(dir, "localhost");
    const line = await pkiDevice(dir, "p1");

    expect(mode(dir)).toBe(0o700);
    expect(mode(join(dir, "ca.key"))).toBe(0o600);
    expect(mode(join(dir, "server.key"))).toBe(0o600);
    expect(mode(join(dir, "devices", "p1.key"))).toBe(0o600);
    expect(mode(join(dir, "devices"))).toBe(0o700);

    const ca = new X509Certificate(readFileSync(join(dir, "ca.crt")));
    const server = new X509Certificate(readFileSync(join(dir, "server.crt")));
    const device = new X509Certificate(readFileSync(join(dir, "devices", "p1.crt")));
    expect(server.verify(ca.publicKey)).toBe(true);
    expect(device.verify(ca.publicKey)).toBe(true);
    expect(server.subjectAltName).toBe("DNS:localhost");
    expect(server.keyUsage).toEqual(["1.3.6.1.5.5.7.3.1"]); // serverAuth
    expect(device.keyUsage).toEqual(["1.3.6.1.5.5.7.3.2"]); // clientAuth
    expect(device.subject).toContain("CN=p1");
    expect(line).toBe(`${fingerprint(device.raw)} p1`);
    expect(line).toMatch(/^[0-9a-f]{64} p1$/);
  });

  it("refuses a folder inside the repo and writes nothing", async () => {
    const inside = join(REPO, "pki-should-not-exist");
    await expect(pkiInit(inside)).rejects.toThrow();
    expect(existsSync(inside)).toBe(false);
    expect(await main(["init", inside])).toBe(2);
    expect(existsSync(inside)).toBe(false);
  });

  it("refuses to overwrite and leaves the files as they were", async () => {
    const dir = join(base, "twice");
    await pkiInit(dir);
    const before = readFileSync(join(dir, "ca.key"));
    await expect(pkiInit(dir)).rejects.toThrow();
    expect(readFileSync(join(dir, "ca.key")).equals(before)).toBe(true);
    await pkiServer(dir, "localhost");
    await expect(pkiServer(dir, "localhost")).rejects.toThrow();
    await pkiDevice(dir, "p1");
    await expect(pkiDevice(dir, "p1")).rejects.toThrow();
  });

  it("rejects bad ids, bad names and a missing CA, writing nothing", async () => {
    const dir = join(base, "bad");
    await pkiInit(dir);
    await expect(pkiDevice(dir, "../x")).rejects.toThrow();
    await expect(pkiDevice(dir, "UP")).rejects.toThrow();
    await expect(pkiServer(dir, "bad name")).rejects.toThrow();
    await expect(pkiServer(dir, `${"a".repeat(64)}.example`)).rejects.toThrow();
    expect(existsSync(join(dir, "devices"))).toBe(false);
    expect(existsSync(join(dir, "server.key"))).toBe(false);

    const empty = join(base, "noca");
    await expect(pkiServer(empty, "localhost")).rejects.toThrow();
    await expect(pkiDevice(empty, "p1")).rejects.toThrow();
    expect(existsSync(empty)).toBe(false);
  });

  it("the CLI exits 2 on rejection and 0 on success", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const dir = join(base, "cli");
      expect(await main(["init", dir])).toBe(0);
      expect(await main(["device", dir, "../x"])).toBe(2);
      expect(await main(["device", dir, "p1"])).toBe(0);
      expect(log).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]{64} p1$/));
      expect(await main(["bogus"])).toBe(2);
      expect(await main(["init"])).toBe(2);
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  });
});
