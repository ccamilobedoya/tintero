import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  API,
  captureLog,
  devHeaders,
  httpsCall,
  makePki,
  rmDir,
  startServerCli,
  startTls,
  tlsAttempt,
  type Pki,
} from "./helpers.ts";

let pki: Pki;
let ca: string;
beforeAll(async () => {
  pki = await makePki();
  ca = readFileSync(pki.caFile, "utf8");
});
afterAll(() => {
  rmDir(pki.root);
});

describe("CA1 el saludo exige certificado de cliente", () => {
  let srv: Awaited<ReturnType<typeof startTls>>;
  beforeEach(async () => {
    srv = await startTls(pki);
  });
  afterEach(async () => {
    await srv.close();
  });

  it("startServer con TLS anuncia una URL https://127.0.0.1:<puerto>", () => {
    expect(srv.url).toMatch(/^https:\/\/127\.0\.0\.1:\d+$/);
  });

  it("sin certificado de cliente el saludo falla y no llega ningún byte de HTTP", async () => {
    const r = await tlsAttempt(srv.port, ca);
    expect(r.timedOut).toBe(false);
    expect(r.received).toBe("");
    expect(r.errored || r.received === "").toBe(true);
  });

  it("con p1 (control) el mismo cliente sí recibe HTTP", async () => {
    const r = await tlsAttempt(srv.port, ca, pki.p1);
    expect(r.received).toMatch(/^HTTP\/1\.1 /);
  });
});

describe("CA1 por línea de comandos", () => {
  it("npm run server -- --port 0 con las cuatro opciones TLS imprime la dirección https", async () => {
    const cli = await startServerCli([
      "--tls-cert",
      pki.serverCert,
      "--tls-key",
      pki.serverKey,
      "--client-ca",
      pki.caFile,
      "--devices",
      pki.devicesFile,
    ]);
    try {
      expect(cli.first).toMatch(/^\{"listening":"https:\/\/127\.0\.0\.1:\d+"\}$/);
      const port = Number((/:(\d+)"\}$/.exec(cli.first) ?? [])[1]);
      const r = await tlsAttempt(port, ca);
      expect(r.received).toBe("");
      const ok = await httpsCall(port, ca, pki.p1, "GET", `${API}/index`, devHeaders());
      expect(ok.status).toBe(200);
    } finally {
      await cli.stop();
    }
  }, 40_000);
});

describe("CA2 certificado de otra CA", () => {
  it("con el certificado de x1 el saludo falla igual y no llega HTTP", async () => {
    const srv = await startTls(pki);
    try {
      const r = await tlsAttempt(srv.port, ca, pki.x1);
      expect(r.timedOut).toBe(false);
      expect(r.received).toBe("");
    } finally {
      await srv.close();
    }
  });
});

describe("CA3 certificado válido pero no listado (p2)", () => {
  it("index, actions y raíz responden 404 sin cuerpo y el registro lleva device null", async () => {
    const log = captureLog();
    const srv = await startTls(pki);
    try {
      const a = await httpsCall(srv.port, ca, pki.p2, "GET", `${API}/index`, devHeaders());
      expect(a.status).toBe(404);
      expect(a.body).toBe("");
      const body = JSON.stringify({ action: "ok", view: "demo" });
      const b = await httpsCall(
        srv.port,
        ca,
        pki.p2,
        "POST",
        `${API}/actions`,
        { ...devHeaders(), "Content-Type": "application/json" },
        body,
      );
      expect(b.status).toBe(404);
      expect(b.body).toBe("");
      const c = await httpsCall(srv.port, ca, pki.p2, "GET", "/");
      expect(c.status).toBe(404);
      expect(c.body).toBe("");
      await log.waitFor((l) => l.route === "/" && l.status === 404);
      const reqLines = log.lines.filter((l) => typeof l.route === "string");
      expect(reqLines.length).toBeGreaterThanOrEqual(3);
      for (const l of reqLines) expect(l.device).toBeNull();
    } finally {
      log.restore();
      await srv.close();
    }
  });

  it("control: p1 listado recibe 200 en el mismo servidor", async () => {
    const srv = await startTls(pki);
    try {
      const r = await httpsCall(srv.port, ca, pki.p1, "GET", `${API}/index`, devHeaders());
      expect(r.status).toBe(200);
    } finally {
      await srv.close();
    }
  });
});
