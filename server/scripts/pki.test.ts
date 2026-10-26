/* eslint-disable security/detect-non-literal-fs-filename -- temp folders of the test */
import { X509Certificate } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { fingerprint } from "../src/tls.ts";
import * as fsp from "node:fs/promises";
import { installFiles, main, pkiDevice, pkiFirmware, pkiInit, pkiServer } from "./pki.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

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

describe("installFiles (writing)", () => {
  it("creates the target exclusively with its own mode, not the source's", async () => {
    const dir = join(base, "inst-mode");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.src"), "a", { mode: 0o666 });
    const spy = vi.mocked(fsp.writeFile);
    spy.mockClear();
    await installFiles([{ from: join(dir, "a.src"), to: join(dir, "a.out"), mode: 0o600 }]);
    expect(spy).toHaveBeenCalledWith(
      join(dir, "a.out"),
      expect.anything(),
      expect.objectContaining({ flag: "wx", mode: 0o600 }),
    );
  });

  it("removes a partial target when the write fails with a non-EEXIST error", async () => {
    const dir = join(base, "inst-partial");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.src"), "a");
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(fsp.writeFile).mockImplementationOnce(async (path, data, options) => {
      await actual.writeFile(path, data, options);
      throw Object.assign(new Error("disk full"), { code: "ENOSPC" });
    });
    await expect(
      installFiles([{ from: join(dir, "a.src"), to: join(dir, "a.out"), mode: 0o600 }]),
    ).rejects.toThrow("disk full");
    expect(existsSync(join(dir, "a.out"))).toBe(false);
  });

  it("never removes a target that already existed (EEXIST)", async () => {
    const dir = join(base, "inst-exists");
    mkdirSync(dir);
    writeFileSync(join(dir, "a.src"), "a");
    writeFileSync(join(dir, "a.out"), "mine");
    await expect(
      installFiles([{ from: join(dir, "a.src"), to: join(dir, "a.out"), mode: 0o600 }]),
    ).rejects.toThrow();
    expect(readFileSync(join(dir, "a.out"), "utf8")).toBe("mine");
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

  it("the CLI exits 2 on rejection and 0 on success (device and init)", async () => {
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

describe("pki firmware (R14, R15)", () => {
  const HOST = "tintero.example.ts.net";
  let pki: string;
  const read = (...parts: string[]): string => readFileSync(join(pki, ...parts), "utf8");
  /** The value of `static const char NAME[] = R"PEM(...)PEM";`. */
  const pemOf = (header: string, name: string): string | undefined => {
    const open = `${name}[] = R"PEM(`;
    const from = header.indexOf(open);
    if (from < 0) return undefined;
    const start = from + open.length;
    return header.slice(start, header.indexOf(')PEM";', start));
  };

  beforeAll(async () => {
    pki = join(base, "fw-pki");
    await pkiInit(pki);
    await pkiServer(pki, HOST);
    await pkiDevice(pki, "p1");
    await pkiDevice(pki, "p2");
  });

  /** Runs the CLI with the console silenced; returns the exit code and what it printed. */
  async function cli(args: string[]): Promise<{ code: number; output: string }> {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((text) => void lines.push(`${text}`));
    const err = vi.spyOn(console, "error").mockImplementation((text) => void lines.push(`${text}`));
    try {
      return { code: await main(args), output: lines.join("\n") };
    } finally {
      log.mockRestore();
      err.mockRestore();
    }
  }

  it("writes one device: host, id and its own PEMs, mode 600, no key on the console", async () => {
    const out = join(base, "fw-ok", "c.h");
    mkdirSync(join(base, "fw-ok"));
    const { code, output } = await cli(["firmware", pki, "--host", HOST, "p1", "--out", out]);
    expect(code).toBe(0);
    expect(output).not.toContain("PRIVATE KEY");
    expect(output).not.toContain("BEGIN");
    expect(mode(out)).toBe(0o600);
    const header = readFileSync(out, "utf8");
    expect(header).toContain(`static const char TINTERO_HOST[] = "${HOST}";`);
    expect(header).toContain('static const char TINTERO_DEVICE_ID[] = "p1";');
    expect(pemOf(header, "TINTERO_CA_PEM")).toBe(read("ca.crt"));
    expect(pemOf(header, "TINTERO_DEVICE_CERT_PEM")).toBe(read("devices", "p1.crt"));
    expect(pemOf(header, "TINTERO_DEVICE_KEY_PEM")).toBe(read("devices", "p1.key"));
    const body = (pem: string): string => pem.split("\n")[1] ?? "";
    expect(header).not.toContain(body(read("devices", "p2.crt")));
    expect(header).not.toContain(body(read("devices", "p2.key")));
    expect(readdirSync(join(base, "fw-ok"))).toEqual(["c.h"]);
  });

  it("replaces an existing file atomically and leaves it at 600", async () => {
    const out = join(base, "fw-replace.h");
    writeFileSync(out, "old", { mode: 0o644 });
    expect((await cli(["firmware", pki, "--host", HOST, "p2", "--out", out])).code).toBe(0);
    expect(mode(out)).toBe(0o600);
    expect(readFileSync(out, "utf8")).toContain('TINTERO_DEVICE_ID[] = "p2"');
    expect(readdirSync(base).filter((name) => name.includes(".tmp"))).toEqual([]);
  });

  it("exits 2 and writes nothing on every bad input (CA14)", async () => {
    const dir = join(base, "fw-bad");
    mkdirSync(dir);
    const out = join(dir, "c.h");
    const bad = [
      ["firmware", pki, "p1", "--out", out], // no --host
      ["firmware", pki, "--host", "a b", "p1", "--out", out],
      ["firmware", pki, "--host", "-bad-.example", "p1", "--out", out],
      ["firmware", pki, "--host", HOST, "--out", out], // no device
      ["firmware", pki, "--host", HOST, "p1", "p2", "--out", out], // two devices
      ["firmware", pki, "--host", HOST, "p9", "--out", out], // no certificate
      ["firmware", pki, "--host", HOST, "../p1", "--out", out],
      ["firmware", pki, "--host", HOST, "p1", "--bogus", "--out", out],
      ["firmware", pki, "--host", HOST, "p1", "--out"],
      ["firmware", pki, "--host", HOST, "--host", HOST, "p1", "--out", out],
      ["firmware", "--host", HOST, "p1", "--out", out], // no folder: "p1" would be the folder
      ["firmware", pki, "--host", HOST, "p1", "--out", join(dir, "nope", "c.h")],
      ["firmware", join(REPO, "pki-no"), "--host", HOST, "p1", "--out", out], // inside the repo
    ];
    for (const args of bad) {
      expect((await cli(args)).code, args.join(" ")).toBe(2);
      expect(readdirSync(dir)).toEqual([]);
    }
  });

  it("refuses a PEM over 4 096 bytes, or one that is not a plain PEM", async () => {
    const big = join(base, "fw-big");
    cpSync(pki, big, { recursive: true });
    const dir = join(base, "fw-big-out");
    mkdirSync(dir);
    const shaped = (n: number): string =>
      `-----BEGIN CERTIFICATE-----\n${"A".repeat(n)}\n-----END CERTIFICATE-----\n`;
    writeFileSync(join(big, "devices", "p1.crt"), shaped(5000));
    expect(
      (await cli(["firmware", big, "--host", HOST, "p1", "--out", join(dir, "c.h")])).code,
    ).toBe(2);
    writeFileSync(join(big, "devices", "p1.crt"), shaped(100).replace("AAAA", ')PEM";'));
    expect(
      (await cli(["firmware", big, "--host", HOST, "p1", "--out", join(dir, "c.h")])).code,
    ).toBe(2);
    writeFileSync(join(big, "devices", "p1.crt"), shaped(100));
    expect(
      (await cli(["firmware", big, "--host", HOST, "p1", "--out", join(dir, "c.h")])).code,
    ).toBe(0);
    expect(readdirSync(dir)).toEqual(["c.h"]);
  });

  it("refuses an output inside the repo that git does not ignore; accepts an ignored one", async () => {
    const tracked = join(REPO, "docs", "c.h");
    expect((await cli(["firmware", pki, "--host", HOST, "p1", "--out", tracked])).code).toBe(2);
    expect(existsSync(tracked)).toBe(false);

    const ignored = join(REPO, "firmware", "include", "tintero_certs.h");
    const existed = existsSync(ignored);
    try {
      if (!existed) {
        expect((await cli(["firmware", pki, "--host", HOST, "p1", "--out", ignored])).code).toBe(0);
        expect(mode(ignored)).toBe(0o600);
        expect(readFileSync(ignored, "utf8")).toContain(HOST);
      }
    } finally {
      if (!existed) rmSync(ignored, { force: true });
    }
    expect(
      readdirSync(join(REPO, "firmware", "include")).filter((n) => n.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("refuses an ignored output whose temporary file git would not ignore (writes nothing)", async () => {
    // `*.log` is ignored, but `<name>.log.<hex>.tmp` is not.
    const out = join(REPO, "tintero-fw-test.log");
    expect((await cli(["firmware", pki, "--host", HOST, "p1", "--out", out])).code).toBe(2);
    expect(existsSync(out)).toBe(false);
    expect(readdirSync(REPO).filter((n) => n.startsWith("tintero-fw-test"))).toEqual([]);
  });

  it("pkiFirmware returns the path it wrote", async () => {
    const out = join(base, "fw-path.h");
    expect(await pkiFirmware(pki, HOST, "p1", out)).toBe(out);
  });
});
