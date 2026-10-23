import { X509Certificate } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pkiDevice, pkiInit, pkiServer } from "../../../server/scripts/pki.ts";
import { ROOT, fpOf, rmDir, runNpm, tmpDir } from "./helpers.ts";

let tmp: string;
beforeEach(() => {
  tmp = tmpDir("tintero-f004-pki-");
});
afterEach(() => {
  rmDir(tmp);
});

const mode = (p: string): number => statSync(p).mode & 0o777;
const listAll = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : [];
const years = (c: X509Certificate): number =>
  (new Date(c.validTo).getTime() - new Date(c.validFrom).getTime()) / (365.25 * 24 * 3600 * 1000);

describe("CA7 funciones pki", () => {
  it("init, server y device crean los archivos; llaves 600 y carpeta 700", async () => {
    const dir = join(tmp, "ca");
    await pkiInit(dir);
    await pkiServer(dir, "localhost");
    const line = await pkiDevice(dir, "p1");
    expect(mode(dir)).toBe(0o700);
    for (const f of ["ca.key", "server.key", "devices/p1.key"])
      expect(mode(join(dir, f))).toBe(0o600);
    for (const f of ["ca.crt", "server.crt", "devices/p1.crt"])
      expect(existsSync(join(dir, f))).toBe(true);
    const crt = new X509Certificate(readFileSync(join(dir, "devices/p1.crt")));
    expect(line).toBe(`${fpOf(crt.toString())} p1`);
    expect(line).toMatch(/^[0-9a-f]{64} p1$/);
  });

  it("certificados: ECDSA P-256, vigencias, usos y SAN, firmados por la CA", async () => {
    const dir = join(tmp, "ca");
    await pkiInit(dir);
    await pkiServer(dir, "localhost");
    await pkiDevice(dir, "p1");
    const ca = new X509Certificate(readFileSync(join(dir, "ca.crt")));
    const srv = new X509Certificate(readFileSync(join(dir, "server.crt")));
    const dev = new X509Certificate(readFileSync(join(dir, "devices/p1.crt")));
    for (const c of [ca, srv, dev]) {
      expect(c.publicKey.asymmetricKeyType).toBe("ec");
      expect(c.publicKey.asymmetricKeyDetails?.namedCurve).toBe("prime256v1");
    }
    expect(years(ca)).toBeGreaterThan(9.9);
    expect(years(ca)).toBeLessThan(10.1);
    expect(years(dev)).toBeGreaterThan(4.9);
    expect(years(dev)).toBeLessThan(5.1);
    expect(years(srv)).toBeGreaterThan(1.9);
    expect(years(srv)).toBeLessThan(2.1);
    expect(dev.keyUsage).toEqual(["1.3.6.1.5.5.7.3.2"]);
    expect(srv.keyUsage).toEqual(["1.3.6.1.5.5.7.3.1"]);
    expect(srv.subjectAltName).toContain("DNS:localhost");
    expect(srv.verify(ca.publicKey)).toBe(true);
    expect(dev.verify(ca.publicKey)).toBe(true);
  });

  it("se niega a escribir si un archivo de destino ya existe (no cambia nada)", async () => {
    const dir = join(tmp, "ca");
    await pkiInit(dir);
    await pkiServer(dir, "localhost");
    await pkiDevice(dir, "p1");
    const before = listAll(dir);
    const key = readFileSync(join(dir, "ca.key"), "utf8");
    await expect(pkiInit(dir)).rejects.toThrow();
    await expect(pkiServer(dir, "localhost")).rejects.toThrow();
    await expect(pkiDevice(dir, "p1")).rejects.toThrow();
    expect(listAll(dir)).toEqual(before);
    expect(readFileSync(join(dir, "ca.key"), "utf8")).toBe(key);
  });

  it("server y device rechazan sin CA y no escriben nada", async () => {
    const dir = join(tmp, "vacia");
    mkdirSync(dir, { mode: 0o700 });
    await expect(pkiServer(dir, "localhost")).rejects.toThrow();
    await expect(pkiDevice(dir, "p1")).rejects.toThrow();
    expect(listAll(dir)).toEqual([]);
  });

  it("id inválido (../x, mayúsculas, vacío, 33 caracteres) rechaza sin escribir fuera", async () => {
    const dir = join(tmp, "ca");
    await pkiInit(dir);
    const before = listAll(tmp);
    for (const id of ["../x", "P1", "", "a".repeat(33), "a/b", "a b"])
      await expect(pkiDevice(dir, id)).rejects.toThrow();
    expect(listAll(tmp)).toEqual(before);
  });

  it("nombre DNS inválido rechaza sin escribir", async () => {
    const dir = join(tmp, "ca");
    await pkiInit(dir);
    const before = listAll(dir);
    for (const name of [
      "",
      "a b",
      "x;rm -rf",
      "-x.com",
      "../x",
      `${"a".repeat(64)}.com`,
      `${"a.".repeat(130)}com`,
    ])
      await expect(pkiServer(dir, name)).rejects.toThrow();
    expect(listAll(dir)).toEqual(before);
  });

  it("carpeta dentro del repo → rechaza y no crea nada", async () => {
    const inside = join(ROOT, "tmp-f004-no-debe-existir");
    await expect(pkiInit(inside)).rejects.toThrow();
    expect(existsSync(inside)).toBe(false);
  });

  it("carpeta que por enlace simbólico cae dentro del repo → rechaza (rutas reales)", async () => {
    const link = join(tmp, "enlace");
    symlinkSync(join(ROOT, "docs"), link);
    try {
      await expect(pkiInit(link)).rejects.toThrow();
    } finally {
      for (const f of ["ca.key", "ca.crt"]) rmSync(join(ROOT, "docs", f), { force: true });
    }
    expect(existsSync(join(ROOT, "docs", "ca.key"))).toBe(false);
  });
});

describe("CA7 CLI npm run pki", () => {
  it("init, server y device crean los archivos y device imprime la línea de la lista", async () => {
    const dir = join(tmp, "cli");
    const a = await runNpm("pki", ["init", dir]);
    expect(a.code, a.err).toBe(0);
    const b = await runNpm("pki", ["server", dir, "localhost"]);
    expect(b.code, b.err).toBe(0);
    const c = await runNpm("pki", ["device", dir, "p1"]);
    expect(c.code, c.err).toBe(0);
    const crt = readFileSync(join(dir, "devices/p1.crt"), "utf8");
    expect(c.out.split("\n")).toContain(`${fpOf(crt)} p1`);
    expect(mode(dir)).toBe(0o700);
    for (const f of ["ca.key", "server.key", "devices/p1.key"])
      expect(mode(join(dir, f))).toBe(0o600);
  }, 60_000);

  it("carpeta dentro del repo → sale con 2 y no escribe", async () => {
    const inside = join(ROOT, "tmp-f004-no-debe-existir");
    const r = await runNpm("pki", ["init", inside]);
    expect(r.code).toBe(2);
    expect(existsSync(inside)).toBe(false);
  });

  it("archivo que ya existe → sale con 2 y no cambia nada", async () => {
    const dir = join(tmp, "cli2");
    expect((await runNpm("pki", ["init", dir])).code).toBe(0);
    const before = listAll(dir);
    const key = readFileSync(join(dir, "ca.key"), "utf8");
    const r = await runNpm("pki", ["init", dir]);
    expect(r.code).toBe(2);
    expect(listAll(dir)).toEqual(before);
    expect(readFileSync(join(dir, "ca.key"), "utf8")).toBe(key);
  });

  it("id = ../x → sale con 2 y no escribe", async () => {
    const dir = join(tmp, "cli3");
    expect((await runNpm("pki", ["init", dir])).code).toBe(0);
    const before = listAll(tmp);
    const r = await runNpm("pki", ["device", dir, "../x"]);
    expect(r.code).toBe(2);
    expect(listAll(tmp)).toEqual(before);
  });
});
