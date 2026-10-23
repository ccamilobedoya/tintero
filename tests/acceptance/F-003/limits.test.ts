import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateErrorBody } from "../../../contract/src/index.ts";
import { startServer } from "../../../server/src/index.ts";
import { API, devHeaders, rawLocal } from "./helpers.ts";

let srv: Awaited<ReturnType<typeof startServer>>;

beforeEach(async () => {
  srv = await startServer({ nextWakeS: 1800, headersTimeoutMs: 500 }, 0);
});
afterEach(async () => {
  await srv.close();
});

const headerText = (h: Record<string, string>): string =>
  Object.entries(h)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join("");

function expectTooLarge(body: string): void {
  const v = validateErrorBody(body);
  expect(v.ok, body).toBe(true);
  expect(v.ok && v.value.error.code).toBe("too_large");
}

describe("CA10 cuerpo grande por la red", () => {
  it("5000 bytes que no son JSON con Content-Length → 413 too_large", async () => {
    const body = "x".repeat(5000);
    const r = await rawLocal(
      srv.url,
      `POST ${API}/actions HTTP/1.1\r\nHost: 127.0.0.1\r\n${headerText(devHeaders())}Content-Type: application/json\r\nContent-Length: 5000\r\n\r\n${body}`,
    );
    expect(r.status).toBe(413);
    expectTooLarge(r.body);
  });

  it("5000 bytes por partes (Transfer-Encoding: chunked, sin Content-Length) → 413 too_large", async () => {
    const chunk = (s: string): string => `${s.length.toString(16)}\r\n${s}\r\n`;
    const payload =
      `POST ${API}/actions HTTP/1.1\r\nHost: 127.0.0.1\r\n${headerText(devHeaders())}` +
      `Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n` +
      chunk("x".repeat(1000)) +
      chunk("x".repeat(2000)) +
      chunk("x".repeat(2000)) +
      "0\r\n\r\n";
    const r = await rawLocal(srv.url, payload);
    expect(r.status).toBe(413);
    expectTooLarge(r.body);
  });

  it("Content-Length de 5000 sin mandar el cuerpo → 413 sin esperar a leerlo", async () => {
    const r = await rawLocal(
      srv.url,
      `POST ${API}/actions HTTP/1.1\r\nHost: 127.0.0.1\r\n${headerText(devHeaders())}Content-Type: application/json\r\nContent-Length: 5000\r\n\r\n`,
      2500,
    );
    expect(r.status).toBe(413);
    expect(r.ms).toBeLessThan(2000);
    expectTooLarge(r.body);
  });

  it("un cuerpo de 4096 bytes no se rechaza por tamaño", async () => {
    const msg = "a".repeat(100);
    const entries = JSON.stringify({ entries: [{ at: 1, level: "info", msg }] });
    const pad = " ".repeat(4096 - entries.length);
    const body = entries + pad;
    expect(body.length).toBe(4096);
    const r = await rawLocal(
      srv.url,
      `POST ${API}/log HTTP/1.1\r\nHost: 127.0.0.1\r\n${headerText(devHeaders())}Content-Type: application/json\r\nContent-Length: 4096\r\n\r\n${body}`,
    );
    expect(r.status).toBe(204);
  });
});

describe("CA13 cabeceras incompletas", () => {
  it("con headersTimeoutMs: 500 la conexión se cierra en menos de 2 s", async () => {
    const r = await rawLocal(
      srv.url,
      `GET ${API}/index HTTP/1.1\r\nHost: 127.0.0.1\r\nTintero-Prot`,
      5000,
    );
    expect(r.closedByServer).toBe(true);
    expect(r.ms).toBeLessThan(2000);
  });

  it("(límite maxHeaderSize 8192, sin CA) cabeceras de 9000 bytes → 431 o conexión cerrada", async () => {
    const r = await rawLocal(
      srv.url,
      `GET ${API}/index HTTP/1.1\r\nHost: 127.0.0.1\r\n${headerText(devHeaders())}X-Relleno: ${"a".repeat(9000)}\r\n\r\n`,
    );
    expect(r.status === 431 || r.status === null).toBe(true);
    expect(r.status).not.toBe(200);
  });
});
