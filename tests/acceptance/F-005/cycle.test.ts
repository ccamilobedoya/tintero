/* eslint-disable security/detect-non-literal-fs-filename -- carpeta temporal propia */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateIndex } from "../../../contract/src/index.ts";
import { defaultConfig, press, runWake, type EmulatorConfig } from "../../../emulator/src/index.ts";
import { zoneId } from "../../../server/src/engine/index.ts";
import {
  API,
  P124,
  dockerNames,
  getLocal,
  devHeaders,
  isBlack,
  registeredContainers,
  rmDir,
  sameBytes,
  startCli,
  tmpDir,
  type Cli,
} from "./helpers.ts";

let cli: Cli;
let store: string;
let own: string[] = [];
let stopped = false;
let cfg: EmulatorConfig;

beforeAll(async () => {
  store = tmpDir("tintero-f005-cycle-");
  const before = new Set(await dockerNames());
  cli = await startCli([
    "--views",
    "config/views.example.json",
    "--data",
    "config/data.example.json",
  ]);
  const mine = new Set(registeredContainers());
  own = (await dockerNames()).filter(
    (n) => n.startsWith("tintero-chromium-") && !before.has(n) && !mine.has(n),
  );
  cfg = { ...defaultConfig(cli.url, store), power: "usb", panel: P124 };
}, 150_000);

afterAll(async () => {
  if (!stopped) await cli.stop();
  rmDir(store);
}, 60_000);

async function served(id: string): Promise<Buffer> {
  const idx = await getLocal(cli.url, `${API}/index`, { headers: devHeaders(P124) });
  const v = validateIndex(idx.text);
  if (!v.ok) throw new Error(`index inválido (${String(idx.status)})`);
  const hash = v.value.views.find((x) => x.id === id)?.hash;
  const img = await getLocal(cli.url, `${API}/views/${id}/image?h=${hash ?? ""}`, {
    headers: devHeaders(P124),
  });
  expect(img.status).toBe(200);
  return img.buf;
}

describe("CA20 ciclo con el emulador", () => {
  it("el servidor arrancó su propio contenedor Chromium", () => {
    expect(own.length).toBeGreaterThanOrEqual(1);
  });

  it("runWake baja las 3 vistas y screen.raw1 es la imagen de hoy", async () => {
    const r = await runWake(cfg);
    expect(r.errors).toEqual([]);
    expect([...r.downloaded].sort()).toEqual(["agenda", "hoy", "pendientes"]);
    const screen = readFileSync(join(store, "screen.raw1"));
    expect(sameBytes(screen, await served("hoy"))).toBe(true);
  }, 90_000);

  it("Tab y Aceptar marcan t-001 y la imagen de hoy cambia", async () => {
    const tab = await press(cfg, "tab");
    expect(tab.focus).toBe(zoneId("hoy", "tareas", "t-001"));
    const ok = await press(cfg, "ok");
    expect(ok.errors).toEqual([]);

    await runWake(cfg);
    const hoy = await served("hoy");
    expect(isBlack(hoy, 800, 17, 103)).toBe(true);
  }, 90_000);
});

describe("CA22 registro", () => {
  it("una línea {ts, render, ms, ok} por dibujo y sin contenido", () => {
    const renderLines = cli.lines
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return {};
        }
      })
      .filter((o) => "render" in o);
    expect(renderLines.length).toBeGreaterThanOrEqual(3);
    for (const o of renderLines) {
      expect(Object.keys(o).sort()).toEqual(["ms", "ok", "render", "ts"]);
      expect(typeof o.render).toBe("number");
      expect(typeof o.ms).toBe("number");
      expect(typeof o.ok).toBe("boolean");
    }
    const all = cli.lines.join("\n");
    for (const secret of [
      "Pagar",
      "factura",
      "Reunión",
      "Casa",
      "Compras",
      "Proyecto",
      "PROJ-",
      "Migrar",
      "t-001",
      "j-142",
    ])
      expect(all, secret).not.toContain(secret);
  });
});

describe("CA20 cierre", () => {
  it("con SIGTERM no queda ningún contenedor suyo en menos de 15 s", async () => {
    const t0 = Date.now();
    await cli.stop();
    stopped = true;
    let left = own;
    while (Date.now() - t0 < 15_000) {
      const running = new Set(await dockerNames());
      left = own.filter((n) => running.has(n));
      if (left.length === 0) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    expect(left).toEqual([]);
  }, 60_000);
});

describe("CA20 cierre con señal al grupo de procesos", () => {
  it("con SIGTERM al grupo no queda su contenedor en menos de 15 s", async () => {
    const before = new Set(await dockerNames());
    const group = await startCli(
      ["--views", "config/views.example.json", "--data", "config/data.example.json"],
      true,
    );
    try {
      const mine = new Set(registeredContainers());
      const groupOwn = (await dockerNames()).filter(
        (n) => n.startsWith("tintero-chromium-") && !before.has(n) && !mine.has(n),
      );
      expect(groupOwn.length).toBeGreaterThanOrEqual(1);

      const t0 = Date.now();
      await group.stop();
      let left = groupOwn;
      while (Date.now() - t0 < 15_000) {
        const running = new Set(await dockerNames());
        left = groupOwn.filter((n) => running.has(n));
        if (left.length === 0) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      expect(left).toEqual([]);
    } finally {
      await group.stop();
    }
  }, 120_000);
});
