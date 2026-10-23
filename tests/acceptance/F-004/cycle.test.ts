import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { defaultConfig, runWake } from "../../../emulator/src/index.ts";
import { startServer } from "../../../server/src/index.ts";
import {
  API,
  captureLog,
  devHeaders,
  httpsCall,
  makePki,
  rmDir,
  runNpm,
  sleep,
  tlsConfig,
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

let closer: (() => Promise<void>) | undefined;
afterEach(async () => {
  await closer?.();
  closer = undefined;
});

async function start(devicesText: string): Promise<{ port: number; file: string }> {
  const file = join(
    pki.root,
    `devices-${String(Date.now())}-${String(Math.random()).slice(2, 8)}.txt`,
  );
  writeFileSync(file, devicesText);
  const srv = await startServer(tlsConfig(pki, {}, file), 0);
  closer = () => srv.close();
  return { port: Number(new URL(srv.url).port), file };
}

const get = (port: number): ReturnType<typeof httpsCall> =>
  httpsCall(port, ca, pki.p1, "GET", `${API}/index`, devHeaders());

describe("CA4 ciclo completo del emulador con p1", () => {
  it("runWake con ca, cert y key descarga las tres vistas sin errores y el registro lleva device p1", async () => {
    const log = captureLog();
    try {
      const { port } = await start(`${pki.p1Line}\n`);
      const store = join(pki.root, "store-wake");
      const config = {
        ...defaultConfig(`https://localhost:${String(port)}`, store),
        tls: { caFile: pki.caFile, certFile: pki.p1.certFile, keyFile: pki.p1.keyFile },
      };
      const report = await runWake(config);
      expect(report.errors).toEqual([]);
      expect(new Set(report.downloaded)).toEqual(new Set(["demo", "detalle", "patron"]));
      await log.waitFor((l) => l.device === "p1");
      expect(
        log.lines.filter((l) => typeof l.route === "string").every((l) => l.device === "p1"),
      ).toBe(true);
    } finally {
      log.restore();
    }
  }, 30_000);

  it("el emulador solo confía en la CA indicada: con la CA equivocada hay error de red", async () => {
    const { port } = await start(`${pki.p1Line}\n`);
    const config = {
      ...defaultConfig(`https://localhost:${String(port)}`, join(pki.root, "store-bad")),
      tls: {
        caFile: join(pki.otherDir, "ca.crt"),
        certFile: pki.p1.certFile,
        keyFile: pki.p1.keyFile,
      },
    };
    const report = await runWake(config).catch(() => null);
    expect(report === null || report.errors.some((e) => e.code === "network")).toBe(true);
    expect(report?.downloaded ?? []).toEqual([]);
  }, 30_000);

  it("npm run emulator con --ca --cert --key y --wakes 1 termina con 0", async () => {
    const { port } = await start(`${pki.p1Line}\n`);
    const r = await runNpm("emulator", [
      "--server",
      `https://localhost:${String(port)}`,
      "--store",
      join(pki.root, "store-cli"),
      "--ca",
      pki.caFile,
      "--cert",
      pki.p1.certFile,
      "--key",
      pki.p1.keyFile,
      "--wakes",
      "1",
    ]);
    expect(r.code, r.err).toBe(0);
  }, 40_000);
});

describe("CA5 revocar quitando la línea, sin reiniciar", () => {
  it("quitar p1 → 404 vacío; volver a ponerlo → 200", async () => {
    const { port, file } = await start(`${pki.p1Line}\n`);
    expect((await get(port)).status).toBe(200);
    writeFileSync(file, "# vacía\n");
    await sleep(20);
    const gone = await get(port);
    expect(gone.status).toBe(404);
    expect(gone.body).toBe("");
    writeFileSync(file, `# de nuevo\n\n${pki.p1Line}\n`);
    await sleep(20);
    expect((await get(port)).status).toBe(200);
  });
});

describe("CA6 lista inválida falla cerrado", () => {
  it("huella de 63 caracteres → 404 vacío y línea devices_error; corregida → 200", async () => {
    const log = captureLog();
    try {
      const { port, file } = await start(`${pki.p1Line}\n`);
      expect((await get(port)).status).toBe(200);
      const [fp = "", id = ""] = pki.p1Line.split(" ");
      expect(fp).toHaveLength(64);
      writeFileSync(file, `${fp.slice(1)} ${id}\n`);
      await sleep(20);
      const bad = await get(port);
      expect(bad.status).toBe(404);
      expect(bad.body).toBe("");
      const err = await log.waitFor((l) => "devices_error" in l);
      expect(typeof err.ts).toBe("string");
      expect(typeof err.devices_error).toBe("string");
      expect(JSON.stringify(err)).not.toContain(fp.slice(1));
      writeFileSync(file, `${pki.p1Line}\n`);
      await sleep(20);
      expect((await get(port)).status).toBe(200);
    } finally {
      log.restore();
    }
  });

  it("lista de más de 64 KiB → ningún aparato listado (404 vacío)", async () => {
    const big = `${pki.p1Line}\n${"# relleno\n".repeat(7000)}`;
    expect(Buffer.byteLength(big)).toBeGreaterThan(64 * 1024);
    const { port } = await start(big);
    const r = await get(port);
    expect(r.status).toBe(404);
    expect(r.body).toBe("");
  });

  it("archivo ilegible (borrado) → 404 vacío", async () => {
    const { port, file } = await start(`${pki.p1Line}\n`);
    expect((await get(port)).status).toBe(200);
    writeFileSync(file, "");
    rmSync(file);
    await sleep(20);
    expect((await get(port)).status).toBe(404);
  });
});
