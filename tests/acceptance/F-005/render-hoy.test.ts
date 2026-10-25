/* eslint-disable security/detect-object-injection -- índices numéricos de listas de prueba */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateZones, type Panel, type Zone } from "../../../contract/src/index.ts";
import { startChromium, zoneId, type RenderedView } from "../../../server/src/engine/index.ts";
import {
  P124,
  P200,
  V124,
  cfgFrom,
  dataFrom,
  dockerNames,
  getViews,
  isBlack,
  launchChromium,
  mkEngine,
  only,
  sameBytes,
  viewOf,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
beforeAll(async () => {
  cr = await launchChromium();
}, 120_000);
afterAll(async () => {
  await cr.stop();
}, 60_000);

async function drawn(panel: Panel, ids: string[] = ["hoy", "pendientes", "agenda"]) {
  const config = cfgFrom(only(ids));
  const engine = mkEngine(cr.renderer, { config, data: dataFrom(config) });
  try {
    return await getViews(engine, "local", panel);
  } finally {
    await engine.idle();
    await engine.close();
  }
}

const byArea = (v: RenderedView, source: string, ids: string[]): Zone[] => {
  const wanted = new Set(ids.map((i) => zoneId(v.id, source, i)));
  return v.zones.filter((z) => wanted.has(z.id));
};

describe("CA6 Chromium real, nitidez", () => {
  it("startChromium → endpoint, y tras stop() el contenedor desaparece", async () => {
    const c = await startChromium();
    expect(c.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(c.name).toMatch(/^tintero-chromium-[0-9a-f]{8}$/);
    expect(await dockerNames()).toContain(c.name);
    await c.stop();
    expect(await dockerNames()).not.toContain(c.name);
  }, 90_000);

  it("hoy en P124: 48 000 bytes, gray = 0, overflow = [], y es repetible", async () => {
    // A view draw is a call whose page marks its blocks with data-fit; the glyph check
    // (also panel-sized since the 2026-10-24 clarification) does not.
    const full = () => cr.renderer.calls.filter((c) => c.html.includes("data-fit="));
    const n0 = full().length;
    const first = await drawn(P124, ["hoy"]);
    const call1 = full()[n0];
    const second = await drawn(P124, ["hoy"]);
    const call2 = full()[n0 + 1];
    expect(viewOf(first.views, "hoy").raw1.length).toBe(48_000);
    expect(call1?.out.raw1.length).toBe(48_000);
    expect(call1?.out.gray).toBe(0);
    expect(call1?.out.overflow).toEqual([]);
    expect(call2?.out.gray).toBe(0);
    expect(call1 && call2 && sameBytes(call1.out.raw1, call2.out.raw1)).toBe(true);
    expect(sameBytes(viewOf(first.views, "hoy").raw1, viewOf(second.views, "hoy").raw1)).toBe(true);
  }, 60_000);
});

describe("CA7 la vista de 4 bloques (P124)", () => {
  it("zonas de cada bloque (prefijo del orden anterior), hidden y sin contenido en el cuerpo de zonas", async () => {
    // F-008: las coordenadas pasan a las reglas de F-008 (su CA3); aquí quedan los ids en orden,
    // la alineación y que «zonas visibles + hidden» de cada bloque sea igual que antes.
    const { views } = await drawn(P124);
    const hoy = viewOf(views, "hoy");
    const zones = hoy.zones;

    const T = ["t-001", "t-002", "t-003", "t-004", "t-005"].map((i) => zoneId("hoy", "tareas", i));
    const E = ["e-002", "e-003", "e-004", "e-005", "e-007"].map((i) =>
      zoneId("hoy", "calendario", i),
    );
    const J = ["j-142", "j-151", "j-160"].map((i) => zoneId("hoy", "jira", i));
    const ids = zones.map((z) => z.id);
    const visT = ids.filter((i) => T.includes(i));
    const visE = ids.filter((i) => E.includes(i));
    const visJ = ids.filter((i) => J.includes(i));
    expect(visT).toEqual(T.slice(0, visT.length));
    expect(visE).toEqual(E.slice(0, visE.length));
    expect(visJ).toEqual(J.slice(0, visJ.length));
    expect(visT.length).toBeGreaterThan(0);
    expect(visE.length).toBeGreaterThan(0);
    expect(visJ.length).toBeGreaterThan(0);
    expect(ids).toEqual([...visT, ...visE, ...visJ]);
    expect(zones.every((z) => z.act === (T.includes(z.id) ? "toggle" : "open"))).toBe(true);
    for (const z of zones) {
      expect(z.x % 8, z.id).toBe(0);
      expect(z.w % 8, z.id).toBe(0);
    }

    expect(visT.length + (hoy.hidden.pendientes ?? 0)).toBe(10);
    expect(visE.length + (hoy.hidden.calendario ?? 0) + (hoy.hidden.eventos ?? 0)).toBe(5);
    expect(visJ.length + (hoy.hidden.jira ?? 0)).toBe(5);
    expect(hoy.overflow).toEqual([]);
    expect(hoy.tooSmall).toEqual([]);

    const body = JSON.stringify({ view: "hoy", hash: hoy.hash, zones });
    expect(validateZones(body, P124).ok).toBe(true);
    for (const secret of [
      "t-001",
      "PROJ-142",
      "j-142",
      "e-003",
      "Pagar",
      "Reunión",
      "Café",
      "Migrar",
    ])
      expect(body).not.toContain(secret);
    for (const z of zones) expect(z.id).toMatch(/^z[0-9a-f]{10}$/);
  }, 60_000);
});

describe("CA8 divisores y calendario (P124)", () => {
  it("píxeles de los divisores y hoy invertido", async () => {
    const { views } = await drawn(P124);
    const hoy = viewOf(views, "hoy").raw1;
    for (const [x, y] of [
      [400, 150],
      [401, 150],
      [200, 280],
      [200, 281],
    ] as const)
      expect(isBlack(hoy, 800, x, y), `negro en (${String(x)}, ${String(y)})`).toBe(true);
    for (const [x, y] of [
      [399, 150],
      [402, 150],
      [200, 279],
      [200, 282],
    ] as const)
      expect(isBlack(hoy, 800, x, y), `blanco en (${String(x)}, ${String(y)})`).toBe(false);
  }, 60_000);

  it("calendario tiene un rectángulo negro relleno de 12 px o más de alto", async () => {
    const { views } = await drawn(P124);
    const img = viewOf(views, "hoy").raw1;
    // Today is a filled black box with a white numeral: look for its frame, i.e. a black
    // top edge of >= 8 px with black columns >= 12 px tall at its left end and 3 px in.
    const W = 800;
    const H = 480;
    const down = (x: number, y: number): number => {
      let n = 0;
      while (y + n < H && isBlack(img, W, x, y + n)) n++;
      return n;
    };
    let found = false;
    for (let y = 284; y < H && !found; y++) {
      for (let x = 404; x + 7 < W && !found; x++) {
        let edge = true;
        for (let k = 0; k < 8 && edge; k++) edge = isBlack(img, W, x + k, y);
        if (edge && down(x, y) >= 12 && down(x + 3, y) >= 12) found = true;
      }
    }
    expect(found).toBe(true);
  }, 60_000);
});

/** Black pixels of column `x` inside the vertical extent of a zone. */
const blackInColumn = (raw1: Uint8Array, x: number, z: Zone): number => {
  let n = 0;
  for (let y = z.y; y < z.y + z.h; y++) if (isBlack(raw1, 800, x, y)) n++;
  return n;
};

describe("CA9 lista completa y casillas (P124)", () => {
  it("pendientes", async () => {
    // F-008: coordenadas por las reglas de F-008; la casilla (15 px) va en zona.x + focusPad (6 px).
    const { views } = await drawn(P124);
    const v = viewOf(views, "pendientes");
    expect(v.zones.length).toBeGreaterThanOrEqual(5);
    expect(v.zones.length + (v.hidden.lista ?? 0)).toBe(10);
    expect(v.zones[0]?.h).toBe(30);
    for (const z of v.zones) {
      expect(z.x % 8).toBe(0);
      expect(z.w % 8).toBe(0);
    }
    expect(v.zones[4]?.id).toBe(zoneId("pendientes", "tareas", "t-005"));
    const [z1, z2] = v.zones;
    if (!z1 || !z2) throw new Error("faltan zonas");
    expect(z1.id).toBe(zoneId("pendientes", "tareas", "t-001"));
    // t-001: pendiente → borde izquierdo de la casilla en zona.x + 6 y centro en blanco
    expect(blackInColumn(v.raw1, z1.x + 6, z1)).toBeGreaterThanOrEqual(10);
    expect(blackInColumn(v.raw1, z1.x + 6 + 7, z1)).toBeLessThanOrEqual(8);
    // t-002: hecha, casilla rellena
    expect(blackInColumn(v.raw1, z2.x + 6 + 7, z2)).toBeGreaterThanOrEqual(12);
  }, 60_000);
});

describe("CA10 otros ppp y panel vertical", () => {
  it("pendientes en P200", async () => {
    const { views } = await drawn(P200);
    const v = viewOf(views, "pendientes");
    // F-008: x y ancho alineados al byte; la fila de 6,2 mm mide 49 px a 200 ppp
    expect(v.zones[0]?.h).toBe(49);
    for (const z of v.zones) {
      expect(z.x % 8).toBe(0);
      expect(z.w % 8).toBe(0);
    }
  }, 60_000);

  it("hoy en V124 usa portrait", async () => {
    const { views } = await drawn(V124);
    const hoy = viewOf(views, "hoy");
    expect(hoy.raw1.length).toBe(48_000);
    expect(hoy.overflow).toEqual([]);
    // F-005 CA10 aclarado: con las filas más altas, jira no cabe en V124
    expect(hoy.tooSmall).toEqual(["jira"]);
    const pend = byArea(hoy, "tareas", ["t-001"]);
    const ev = byArea(hoy, "calendario", ["e-002", "e-003", "e-004", "e-005", "e-007"]);
    // F-008: alineadas al byte y filas de 30 px
    for (const z of [pend[0], ev[0]]) {
      expect(z?.x).toBe(8);
      expect((z?.w ?? 1) % 8).toBe(0);
      expect(z?.h).toBe(30);
    }
  }, 60_000);
});

describe("Presupuesto de dibujo", () => {
  it("promedio de 5 dibujos de hoy en P124 tras uno de calentamiento: < 500 ms", async () => {
    await drawn(P124, ["hoy"]);
    const full = cr.renderer.calls.filter((c) => c.html.includes("data-fit="));
    const html = full.at(-1)?.html ?? "";
    expect(html).not.toBe("");
    await cr.renderer.render(html, P124);
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      await cr.renderer.render(html, P124);
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(
      `PRESUPUESTO ms: ${times.map((t) => t.toFixed(0)).join(",")} promedio ${avg.toFixed(0)}`,
    );
    expect(avg).toBeLessThan(500);
  }, 60_000);
});
