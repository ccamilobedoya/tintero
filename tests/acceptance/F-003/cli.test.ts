import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { validateErrorBody, validateIndex } from "../../../contract/src/index.ts";
import { API, ROOT, devHeaders, getLocal, startCli, type Cli } from "./helpers.ts";

let cli: Cli | undefined;
afterEach(async () => {
  await cli?.stop();
  cli = undefined;
});

function runServerCli(args: string[]): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const p = spawn("npm", ["run", "--silent", "server", "--", ...args], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => (out += d.toString()));
    p.stderr.on("data", (d: Buffer) => (err += d.toString()));
    const t = setTimeout(() => {
      if (p.pid) {
        try {
          process.kill(-p.pid, "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }, 20_000);
    p.on("close", (code) => {
      clearTimeout(t);
      resolve({ code, out, err });
    });
  });
}

describe("CA1 arranque por línea de comandos", () => {
  it("--port 0 imprime la dirección en la primera línea y responde", async () => {
    cli = await startCli();
    expect(cli.lines[0]).toMatch(/^\{"listening":"http:\/\/127\.0\.0\.1:\d+"\}$/);
    const r = await getLocal(cli.url, `${API}/index`, { headers: devHeaders() });
    expect(r.status).toBe(200);
    expect(validateIndex(r.text).ok).toBe(true);
    const idx = JSON.parse(r.text) as { next_wake_s: number };
    expect(idx.next_wake_s).toBe(1800);
  });

  it("--next-wake-s cambia next_wake_s", async () => {
    cli = await startCli(["--next-wake-s", "900"]);
    const r = await getLocal(cli.url, `${API}/index`, { headers: devHeaders() });
    expect((JSON.parse(r.text) as { next_wake_s: number }).next_wake_s).toBe(900);
  });

  for (const host of ["0.0.0.0", "::", "192.168.1.10"]) {
    it(`--host ${host} sale con 2 sin escuchar y menciona F-004`, async () => {
      const r = await runServerCli(["--port", "0", "--host", host]);
      expect(r.code).toBe(2);
      expect(r.out).not.toContain("listening");
      expect(r.out + r.err).toContain("F-004");
    });
  }

  it("SIGTERM cierra de forma ordenada", async () => {
    cli = await startCli();
    await cli.stop();
    await expect(getLocal(cli.url, `${API}/index`, { headers: devHeaders() })).rejects.toThrow();
    cli = undefined;
  });
});

const isLogLine = (l: string): boolean => l.includes('"device_log"');

describe("CA11 POST /log", () => {
  const post = (url: string, body: string) =>
    getLocal(url, `${API}/log`, {
      method: "POST",
      headers: { ...devHeaders(), "content-type": "application/json" },
      body,
    });

  it("204 y una línea device_log; el carácter de control se elimina", async () => {
    cli = await startCli();
    const r = await post(
      cli.url,
      JSON.stringify({
        entries: [
          { at: 1700000000, level: "warn", msg: "ab\u0007cd\u001bef" },
          { at: 1700000001, level: "info", msg: "limpio" },
        ],
      }),
    );
    expect(r.status).toBe(204);
    expect(r.buf.length).toBe(0);
    await cli.waitFor((l) => isLogLine(l) && l.includes("limpio"));
    const logs = cli.lines
      .filter(isLogLine)
      .map((l) => JSON.parse(l) as { ts: unknown; device_log: { level: string; msg: string } });
    expect(logs.length).toBe(2);
    for (const l of logs) {
      expect(Object.keys(l).sort()).toEqual(["device_log", "ts"]);
      expect(Object.keys(l.device_log).sort()).toEqual(["level", "msg"]);
    }
    expect(logs[0]?.device_log).toEqual({ level: "warn", msg: "abcdef" });
    expect(logs[1]?.device_log).toEqual({ level: "info", msg: "limpio" });
    // eslint-disable-next-line no-control-regex -- the point of the test
    expect(cli.lines.some((l) => /[\u0000-\u0008\u000b-\u001f]/.test(l))).toBe(false);
  });

  it("msg de 200 caracteres sale completo (≤ 200)", async () => {
    cli = await startCli();
    const r = await post(
      cli.url,
      JSON.stringify({ entries: [{ at: 1, level: "error", msg: "m".repeat(200) }] }),
    );
    expect(r.status).toBe(204);
    const line = await cli.waitFor(isLogLine);
    const msg = (JSON.parse(line) as { device_log: { msg: string } }).device_log.msg;
    expect(msg.length).toBeLessThanOrEqual(200);
    expect(msg.length).toBeGreaterThan(0);
  });

  it("cuerpo inválido → 400 con ErrorBody", async () => {
    cli = await startCli();
    for (const body of [
      "no es json",
      "{}",
      JSON.stringify({ entries: [] }),
      JSON.stringify({ entries: [{ at: 1, level: "fatal", msg: "x" }] }),
      JSON.stringify({ entries: [{ at: 1, level: "info", msg: "" }] }),
    ]) {
      const r = await post(cli.url, body);
      expect(r.status, body).toBe(400);
      expect(validateErrorBody(r.text).ok).toBe(true);
    }
    expect(cli.lines.some(isLogLine)).toBe(false);
  });
});

describe("CA14 registro sin contenido", () => {
  it("una línea JSON por petición con exactamente los campos de la ficha", async () => {
    cli = await startCli();
    const headers = devHeaders(undefined, {
      "Tintero-Firmware": "fw-visible-9",
      "Tintero-Power": "usb",
      "Tintero-Battery-mV": "4321",
      "Tintero-RSSI": "-97",
      "User-Agent": "agente-secreto-xyz",
      Cookie: "sesion=cookie-secreta-123",
    });
    const idx = JSON.parse((await getLocal(cli.url, `${API}/index`, { headers })).text) as {
      views: { id: string; hash: string }[];
    };
    const demo = idx.views.find((v) => v.id === "demo")?.hash ?? "";
    await getLocal(cli.url, `${API}/views/demo/image?h=${demo}`, { headers });
    await getLocal(cli.url, `${API}/views/demo/zones?h=${demo}`, { headers });
    await getLocal(cli.url, `${API}/views/demo/image?h=0000000000000000`, { headers });
    await getLocal(cli.url, `${API}/otra?secreto=consulta-secreta`, { headers });
    await getLocal(cli.url, `${API}/actions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({
        actions: [{ id: "cuerpo-secreto-1", view: "demo", zone: "c1", act: "toggle", at: 1 }],
      }),
    });
    await cli.waitFor((l) => l.includes('"/api/v1/actions"') || l.includes("api/v1/actions"));
    await new Promise((r) => setTimeout(r, 200));

    const reqLines = cli.lines.slice(1);
    expect(reqLines.length).toBe(6);
    const KEYS = ["bytes", "firmware", "method", "ms", "power", "route", "status", "ts"];
    for (const line of reqLines) {
      const o = JSON.parse(line) as Record<string, unknown>;
      expect(Object.keys(o).sort(), line).toEqual(KEYS);
      expect(typeof o.method).toBe("string");
      expect(typeof o.route).toBe("string");
      expect(String(o.route)).not.toContain("?");
      expect(typeof o.status).toBe("number");
      expect(typeof o.bytes).toBe("number");
      expect(typeof o.ms).toBe("number");
      expect(o.firmware).toBe("fw-visible-9");
      expect(o.power).toBe("usb");
      expect(line.length).toBeLessThan(400);
    }
    const all = cli.lines.join("\n");
    for (const secret of [
      "agente-secreto-xyz",
      "cookie-secreta-123",
      "consulta-secreta",
      "cuerpo-secreto-1",
      "w=800",
      "raw1",
      "Cookie",
    ])
      expect(all, secret).not.toContain(secret);
    const routes = reqLines.map((l) => (JSON.parse(l) as { route: string }).route);
    expect(routes).toEqual([
      `${API}/index`,
      `${API}/views/demo/image`,
      `${API}/views/demo/zones`,
      `${API}/views/demo/image`,
      `${API}/otra`,
      `${API}/actions`,
    ]);
    const statuses = reqLines.map((l) => (JSON.parse(l) as { status: number }).status);
    expect(statuses).toEqual([200, 200, 200, 409, 404, 200]);
  });
});
