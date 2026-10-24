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

const rect = (z: Zone) => ({ x: z.x, y: z.y, w: z.w, h: z.h });
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
    const first = await drawn(P124, ["hoy"]);
    const call1 = cr.renderer.calls.at(-1);
    const second = await drawn(P124, ["hoy"]);
    const call2 = cr.renderer.calls.at(-1);
    expect(call1?.out.raw1.length).toBe(48_000);
    expect(call1?.out.gray).toBe(0);
    expect(call1?.out.overflow).toEqual([]);
    expect(call2?.out.gray).toBe(0);
    expect(call1 && call2 && sameBytes(call1.out.raw1, call2.out.raw1)).toBe(true);
    expect(sameBytes(viewOf(first.views, "hoy").raw1, viewOf(second.views, "hoy").raw1)).toBe(true);
  }, 60_000);
});

describe("CA7 la vista de 4 bloques (P124)", () => {
  it("13 zonas en orden, hidden y sin contenido en el cuerpo de zonas", async () => {
    const { views } = await drawn(P124);
    const hoy = viewOf(views, "hoy");
    const zones = hoy.zones;
    expect(zones).toHaveLength(13);

    const T = ["t-001", "t-002", "t-003", "t-004", "t-005"];
    const E = ["e-002", "e-003", "e-004", "e-005", "e-007"];
    const J = ["j-142", "j-151", "j-160"];
    const expected = [
      ...T.map((id, i) => ({
        id: zoneId("hoy", "tareas", id),
        act: "toggle",
        x: 10,
        y: [92, 116, 140, 164, 210][i],
        w: 380,
        h: 24,
      })),
      ...E.map((id, i) => ({
        id: zoneId("hoy", "calendario", id),
        act: "open",
        x: 412,
        y: [92, 116, 140, 186, 232][i],
        w: 378,
        h: 24,
      })),
      ...J.map((id, i) => ({
        id: zoneId("hoy", "jira", id),
        act: "open",
        x: 10,
        y: [316, 360, 404][i],
        w: 380,
        h: 44,
      })),
    ];
    expect(zones.map((z) => ({ id: z.id, act: z.act, ...rect(z) }))).toEqual(expected);

    expect(hoy.hidden).toEqual({ pendientes: 5, eventos: 0, jira: 2, calendario: 0 });
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

describe("CA9 lista completa y casillas (P124)", () => {
  it("pendientes", async () => {
    const { views } = await drawn(P124);
    const v = viewOf(views, "pendientes");
    expect(v.zones).toHaveLength(10);
    expect(v.hidden).toEqual({ lista: 0 });
    expect(v.zones[0]).toMatchObject({ x: 10, y: 68, w: 780, h: 24 });
    expect(v.zones[4]?.id).toBe(zoneId("pendientes", "tareas", "t-005"));
    expect(v.zones[4]?.y).toBe(186);
    // t-001: pendiente, casilla en (10, 72) de 15 × 15
    expect(isBlack(v.raw1, 800, 10, 79)).toBe(true);
    expect(isBlack(v.raw1, 800, 11, 79)).toBe(true);
    expect(isBlack(v.raw1, 800, 17, 79)).toBe(false);
    // t-002: hecha, casilla rellena
    expect(isBlack(v.raw1, 800, 17, 103)).toBe(true);
  }, 60_000);
});

describe("CA10 otros ppp y panel vertical", () => {
  it("pendientes en P200", async () => {
    const { views } = await drawn(P200);
    const v = viewOf(views, "pendientes");
    expect(v.zones[0]).toMatchObject({ x: 16, y: 110, w: 768, h: 39 });
  }, 60_000);

  it("hoy en V124 usa portrait", async () => {
    const { views } = await drawn(V124);
    const hoy = viewOf(views, "hoy");
    expect(hoy.raw1.length).toBe(48_000);
    expect(hoy.overflow).toEqual([]);
    expect(hoy.tooSmall).toEqual([]);
    const pend = byArea(hoy, "tareas", ["t-001"]);
    const ev = byArea(hoy, "calendario", ["e-002", "e-003", "e-004", "e-005", "e-007"]);
    expect(pend.map(rect)[0]).toEqual({ x: 10, y: 92, w: 460, h: 24 });
    expect(ev.map(rect)[0]).toEqual({ x: 10, y: 361, w: 460, h: 24 });
  }, 60_000);
});
