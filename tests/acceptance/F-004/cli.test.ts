import { get } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { API, devHeaders, makePki, rmDir, runNpm, startServerCli, type Pki } from "./helpers.ts";

let pki: Pki;
beforeAll(async () => {
  pki = await makePki();
});
afterAll(() => {
  rmDir(pki.root);
});

describe("CA11 sin TLS sigue igual que F-003", () => {
  for (const host of ["0.0.0.0", "::", "192.168.1.10"]) {
    it(`--host ${host} sale con 2 sin escuchar`, async () => {
      const r = await runNpm("server", ["--port", "0", "--host", host]);
      expect(r.code).toBe(2);
      expect(r.out).not.toContain("listening");
    });
  }

  it("--host distinto de 127.0.0.1 también sale con 2 con las opciones TLS", async () => {
    const r = await runNpm("server", [
      "--port",
      "0",
      "--host",
      "0.0.0.0",
      "--tls-cert",
      pki.serverCert,
      "--tls-key",
      pki.serverKey,
      "--client-ca",
      pki.caFile,
      "--devices",
      pki.devicesFile,
    ]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("sin TLS arranca en http://127.0.0.1 y responde", async () => {
    const cli = await startServerCli([]);
    try {
      expect(cli.first).toMatch(/^\{"listening":"http:\/\/127\.0\.0\.1:\d+"\}$/);
      const url = (/"(http:[^"]+)"/.exec(cli.first) ?? [])[1] ?? "";
      expect(url).not.toBe("");
      const status = await new Promise<number>((resolve, reject) => {
        get(`${url}${API}/index`, { headers: devHeaders() }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }).on("error", reject);
      });
      expect(status).toBe(200);
    } finally {
      await cli.stop();
    }
  }, 40_000);
});

describe("CA12 opciones incompletas o inválidas", () => {
  it("solo --tls-cert → sale con 2 sin escuchar", async () => {
    const r = await runNpm("server", ["--port", "0", "--tls-cert", pki.serverCert]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("tres de las cuatro opciones (falta --devices) → sale con 2 sin escuchar", async () => {
    const r = await runNpm("server", [
      "--port",
      "0",
      "--tls-cert",
      pki.serverCert,
      "--tls-key",
      pki.serverKey,
      "--client-ca",
      pki.caFile,
    ]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("un archivo que no existe → sale con 2 sin escuchar", async () => {
    const r = await runNpm("server", [
      "--port",
      "0",
      "--tls-cert",
      pki.serverCert,
      "--tls-key",
      pki.serverKey,
      "--client-ca",
      pki.caFile,
      "--devices",
      `${pki.root}/no-existe.txt`,
    ]);
    expect(r.code).toBe(2);
    expect(r.out).not.toContain("listening");
  });

  it("emulador con --cert y una URL http:// → sale con 2", async () => {
    const r = await runNpm("emulator", [
      "--server",
      "http://127.0.0.1:9",
      "--store",
      `${pki.root}/store-x`,
      "--cert",
      pki.p1.certFile,
    ]);
    expect(r.code).toBe(2);
  });

  it("emulador con --ca --cert --key completos y una URL http:// → sale con 2", async () => {
    const r = await runNpm("emulator", [
      "--server",
      "http://127.0.0.1:9",
      "--store",
      `${pki.root}/store-y`,
      "--ca",
      pki.caFile,
      "--cert",
      pki.p1.certFile,
      "--key",
      pki.p1.keyFile,
    ]);
    expect(r.code).toBe(2);
  });

  it("emulador con https:// y solo --ca (faltan --cert y --key) → sale con 2", async () => {
    const r = await runNpm("emulator", [
      "--server",
      "https://localhost:9",
      "--store",
      `${pki.root}/store-z`,
      "--ca",
      pki.caFile,
    ]);
    expect(r.code).toBe(2);
  });
});
