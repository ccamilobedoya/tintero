import { readFileSync } from "node:fs";
import { connect, type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateErrorBody, validateIndex, type Panel } from "../../../contract/src/index.ts";
import { createApp, startServer } from "../../../server/src/index.ts";
import {
  API,
  PANEL,
  devHeaders,
  httpsCall,
  makePki,
  rawTcp,
  rmDir,
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

const panelN = (k: number): Panel => ({
  w: 64 + 8 * (k % 30),
  h: 64 + 8 * Math.floor(k / 30),
  dpi: 124,
  depth: 1,
});

describe("CA8 límite de paneles por aparato (p1, TLS)", () => {
  it("dos paneles distintos → 200; el tercero → 400 invalid_request y renders() no aumenta", async () => {
    const made = createApp(tlsConfig(pki, { maxPanelsPerDevice: 2 }));
    const app = made.app;
    const renders = (): number => made.renders();
    await app.listen({ host: "127.0.0.1", port: 0 });
    const port = (app.server.address() as AddressInfo).port;
    try {
      const idx = async (p: Panel): ReturnType<typeof httpsCall> =>
        httpsCall(port, ca, pki.p1, "GET", `${API}/index`, devHeaders(p));
      const a = await idx(PANEL);
      expect(a.status).toBe(200);
      expect(validateIndex(a.body).ok).toBe(true);
      expect((await idx(panelN(0))).status).toBe(200);
      const before = renders();
      expect(before).toBeGreaterThan(0);
      const c = await idx(panelN(1));
      expect(c.status).toBe(400);
      const v = validateErrorBody(c.body);
      expect(v.ok && v.value.error.code).toBe("invalid_request");
      expect(renders()).toBe(before);
      // Un panel ya usado sigue sirviéndose.
      expect((await idx(PANEL)).status).toBe(200);
      expect(renders()).toBe(before);
    } finally {
      await app.close();
    }
  });
});

describe("CA8 caché de 48 entradas con expulsión del menos usado", () => {
  it("al llenarse nunca se vacía entera y lo usado recientemente no se redibuja", async () => {
    const made = createApp({
      nextWakeS: 1800,
      headersTimeoutMs: 10_000,
      maxPanelsPerDevice: 1000,
    });
    const app = made.app;
    const renders = (): number => made.renders();
    try {
      const fetchPanel = async (p: Panel): Promise<void> => {
        const r = await app.inject({ method: "GET", url: `${API}/index`, headers: devHeaders(p) });
        expect(r.statusCode).toBe(200);
        const v = validateIndex(r.body);
        if (!v.ok) throw new Error("índice inválido");
        for (const view of v.value.views) {
          const img = await app.inject({
            method: "GET",
            url: `${API}/views/${view.id}/image?h=${view.hash}`,
            headers: devHeaders(p),
          });
          expect(img.statusCode).toBe(200);
        }
      };
      await fetchPanel(panelN(0));
      const perPanel = renders();
      expect(perPanel).toBeGreaterThan(0);
      // Suficientes paneles para pasar el límite de 48 entradas varias veces.
      const total = Math.ceil(48 / perPanel) * 3;
      for (let k = 1; k < total; k++) {
        // Se mantiene vivo el panel 0 (menos usado = el que no se toca).
        await fetchPanel(panelN(0));
        const prev = renders();
        await fetchPanel(panelN(k));
        expect(renders()).toBeGreaterThan(prev);
        // El panel recién usado justo antes (k-1) sigue en caché: nunca se vació entera.
        if (k > 1) {
          const r0 = renders();
          await fetchPanel(panelN(k - 1));
          expect(renders(), `panel ${String(k - 1)} redibujado tras pedir el ${String(k)}`).toBe(
            r0,
          );
        }
      }
      // El panel 0, usado en cada vuelta, sigue en caché.
      const r1 = renders();
      await fetchPanel(panelN(0));
      expect(renders()).toBe(r1);
      // Uno antiguo y sin uso (panel 1) ya fue expulsado: se vuelve a dibujar.
      await fetchPanel(panelN(1));
      expect(renders()).toBeGreaterThan(r1);
    } finally {
      await app.close();
    }
  }, 60_000);
});

describe("CA9 tiempos y conexiones", () => {
  it("requestTimeoutMs 1000: un POST de un byte por segundo se corta en menos de 3 s", async () => {
    const srv = await startServer(
      { nextWakeS: 1800, headersTimeoutMs: 10_000, requestTimeoutMs: 1000 },
      0,
    );
    try {
      const port = Number(new URL(srv.url).port);
      const head =
        `POST ${API}/actions HTTP/1.1\r\nHost: 127.0.0.1\r\n` +
        Object.entries(devHeaders())
          .map(([k, v]) => `${k}: ${v}\r\n`)
          .join("") +
        "Content-Type: application/json\r\nContent-Length: 60\r\n\r\n";
      const r = await rawTcp(
        port,
        (write) => {
          write(head);
          let i = 0;
          const t = setInterval(() => {
            write("x");
            if (++i >= 8) clearInterval(t);
          }, 1000);
        },
        6000,
      );
      expect(r.closed, `no se cortó; ms=${String(r.ms)}`).toBe(true);
      expect(r.ms).toBeLessThan(3000);
    } finally {
      await srv.close();
    }
  }, 20_000);

  it("maxConnections 2: la tercera conexión simultánea se cierra sin respuesta HTTP", async () => {
    const srv = await startServer(
      { nextWakeS: 1800, headersTimeoutMs: 10_000, maxConnections: 2 },
      0,
    );
    const held = [] as ReturnType<typeof connect>[];
    try {
      const port = Number(new URL(srv.url).port);
      for (let i = 0; i < 2; i++) {
        const s = connect({ host: "127.0.0.1", port });
        s.on("error", () => undefined);
        held.push(s);
        await new Promise<void>((r) =>
          s.once("connect", () => {
            r();
          }),
        );
      }
      await sleep(200);
      const third = await rawTcp(
        port,
        (write) => {
          write(
            `GET ${API}/index HTTP/1.1\r\nHost: 127.0.0.1\r\n${Object.entries(devHeaders())
              .map(([k, v]) => `${k}: ${v}\r\n`)
              .join("")}\r\n`,
          );
        },
        3000,
      );
      expect(third.closed).toBe(true);
      expect(third.data).not.toContain("HTTP/");
    } finally {
      for (const s of held) s.destroy();
      await srv.close();
    }
  }, 20_000);

  it("handshakeTimeoutMs 1000: un cliente TCP que no saluda queda cerrado en menos de 3 s", async () => {
    const srv = await startServer(tlsConfig(pki, { handshakeTimeoutMs: 1000 }), 0);
    try {
      const port = Number(new URL(srv.url).port);
      const r = await rawTcp(port, () => undefined, 6000);
      expect(r.closed, `no se cerró; ms=${String(r.ms)}`).toBe(true);
      expect(r.ms).toBeLessThan(3000);
      expect(r.data).toBe("");
    } finally {
      await srv.close();
    }
  }, 20_000);
});
