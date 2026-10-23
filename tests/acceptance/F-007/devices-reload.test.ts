import { readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatPanelHeader } from "../../../contract/src/index.ts";
import { pkiDevice, pkiInit, pkiServer } from "../../../server/scripts/pki.ts";
import { startServer } from "../../../server/src/index.ts";
import { rmDir, tmpDir } from "./helpers.ts";

let root: string;
beforeAll(() => {
  root = tmpDir();
});
afterAll(() => {
  rmDir(root);
});

function get(
  port: number,
  ca: string,
  cert: string,
  key: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        servername: "localhost",
        method: "GET",
        path: "/api/v1/index",
        ca,
        cert,
        key,
        agent: false,
        headers: {
          Host: "localhost",
          Connection: "close",
          "Tintero-Protocol": "1",
          "Tintero-Firmware": "test-0.1.0",
          "Tintero-Power": "battery",
          "Tintero-Formats": "raw1",
          "Tintero-Panel": formatPanelHeader({ w: 800, h: 480, dpi: 124, depth: 1 }),
        },
        timeout: 8000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d: Buffer) => chunks.push(d));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("CA3 la lista de aparatos se recarga con misma fecha y mismo tamaño", () => {
  it("lista cambiada (mismo tamaño, misma mtime) → p1 recibe 404 vacío", async () => {
    const pki = join(root, "pki");
    await pkiInit(pki);
    await pkiServer(pki, "localhost");
    const line = await pkiDevice(pki, "p1");
    const list = join(root, "devices.txt");
    writeFileSync(list, `${line}\n`);

    const srv = await startServer(
      {
        nextWakeS: 1800,
        headersTimeoutMs: 10_000,
        tls: {
          certFile: join(pki, "server.crt"),
          keyFile: join(pki, "server.key"),
          clientCaFile: join(pki, "ca.crt"),
          devicesFile: list,
        },
      },
      0,
    );
    try {
      const port = Number(new URL(srv.url).port);
      const ca = readFileSync(join(pki, "ca.crt"), "utf8");
      const cert = readFileSync(join(pki, "devices", "p1.crt"), "utf8");
      const key = readFileSync(join(pki, "devices", "p1.key"), "utf8");

      const before = await get(port, ca, cert, key);
      expect(before.status).toBe(200);

      const st = statSync(list);
      const other = `${"0".repeat(64)} p1\n`;
      expect(Buffer.byteLength(other)).toBe(st.size);
      writeFileSync(list, other);
      utimesSync(list, st.atime, st.mtime);
      expect(statSync(list).mtimeMs).toBe(st.mtimeMs);
      expect(statSync(list).size).toBe(st.size);

      const after = await get(port, ca, cert, key);
      expect(after.status).toBe(404);
      expect(after.body).toBe("");
    } finally {
      await srv.close();
    }
  });
});
