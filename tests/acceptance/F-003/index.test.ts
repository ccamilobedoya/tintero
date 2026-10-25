import { beforeEach, describe, expect, it } from "vitest";
import {
  crc32Hex,
  raw1Bytes,
  validateErrorBody,
  validateIndex,
  type Panel,
} from "../../../contract/src/index.ts";
import { createApp } from "../../../server/src/index.ts";
import {
  API,
  CFG,
  PANEL,
  devHeaders,
  getImage,
  getIndex,
  getZones,
  hashOf,
  isBlack,
  rectAll,
  type App,
} from "./helpers.ts";

let app: App;
beforeEach(() => {
  app = createApp(CFG).app;
});

const unit = (p: Panel): number => Math.round(Math.min(p.w, p.h) / 24);
const cm = (p: Panel, k: number): number => Math.round((k * p.dpi) / 2.54);

describe("CA2 índice", () => {
  it("pasa validateIndex con vistas en orden, current, parent, panel, bytes y next_wake_s", async () => {
    const r = await app.inject({ method: "GET", url: `${API}/index`, headers: devHeaders() });
    expect(r.statusCode).toBe(200);
    const v = validateIndex(r.body);
    expect(v.ok).toBe(true);
    const idx = await getIndex(app);
    expect(idx.views.map((x) => x.id)).toEqual(["demo", "detalle", "patron"]);
    expect(idx.current).toBe("demo");
    expect(idx.views.find((x) => x.id === "detalle")?.parent).toBe("demo");
    expect(idx.panel).toEqual(PANEL);
    expect(idx.next_wake_s).toBe(1800);
    expect(idx.full_refresh).toBe(false);
    for (const view of idx.views) {
      expect(view.format).toBe("raw1");
      expect(view.bytes).toBe(48000);
      const img = await getImage(app, view.id, view.hash);
      expect(img.length).toBe(48000);
      expect(view.crc32).toBe(crc32Hex(img));
      expect(view.hash).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it("next_wake_s sale de la configuración", async () => {
    const other = createApp({ nextWakeS: 600, headersTimeoutMs: 10_000 }).app;
    expect((await getIndex(other)).next_wake_s).toBe(600);
  });
});

describe("CA2 / D2 vistas de demostración en 800 × 480", () => {
  it("demo: zonas c1–c3 y abrir con la geometría de la ficha; casillas sin marcar con borde de 2 px", async () => {
    const idx = await getIndex(app);
    const h = hashOf(idx, "demo");
    const z = await getZones(app, "demo", h);
    expect(z.view).toBe("demo");
    expect(z.hash).toBe(h);
    expect(z.zones).toEqual([
      // F-008: zonas alineadas al byte, x = 16 (antes 20)
      { id: "c1", x: 16, y: 40, w: 120, h: 40, act: "toggle" },
      { id: "c2", x: 16, y: 100, w: 120, h: 40, act: "toggle" },
      { id: "c3", x: 16, y: 160, w: 120, h: 40, act: "toggle" },
      { id: "abrir", x: 16, y: 220, w: 120, h: 40, act: "open" },
    ]);
    const img = await getImage(app, "demo", h);
    // 2 px black border around the panel
    for (const [x, y] of [
      [0, 0],
      [1, 240],
      [798, 240],
      [799, 479],
      [400, 0],
      [400, 1],
      [400, 478],
      [400, 479],
    ] as const)
      expect(isBlack(img, 800, x, y)).toBe(true);
    expect(isBlack(img, 800, 400, 2)).toBe(false);
    expect(isBlack(img, 800, 2, 240)).toBe(false);
    for (const c of z.zones.filter((q) => q.act === "toggle")) {
      // unchecked: 2 px border only
      expect(isBlack(img, 800, c.x, c.y)).toBe(true);
      expect(isBlack(img, 800, c.x + 1, c.y + 1)).toBe(true);
      expect(isBlack(img, 800, c.x + c.w - 1, c.y + c.h - 1)).toBe(true);
      expect(rectAll(img, 800, { x: c.x + 2, y: c.y + 2, w: c.w - 4, h: c.h - 4 }, false)).toBe(
        true,
      );
    }
  });

  it("detalle: parent demo, sin zonas, borde y cuadrado negro de 80 × 80 en (20, 20)", async () => {
    const idx = await getIndex(app);
    const h = hashOf(idx, "detalle");
    expect((await getZones(app, "detalle", h)).zones).toEqual([]);
    const img = await getImage(app, "detalle", h);
    expect(rectAll(img, 800, { x: 20, y: 20, w: 80, h: 80 }, true)).toBe(true);
    expect(isBlack(img, 800, 19, 19)).toBe(false);
    expect(isBlack(img, 800, 100, 100)).toBe(false);
    expect(isBlack(img, 800, 0, 0)).toBe(true);
    expect(isBlack(img, 800, 400, 300)).toBe(false);
  });

  it("patron: cuadrícula de 1 cm con líneas de 1 px en x_k e y_k", async () => {
    const idx = await getIndex(app);
    const h = hashOf(idx, "patron");
    expect((await getZones(app, "patron", h)).zones).toEqual([]);
    const img = await getImage(app, "patron", h);
    let lines = 0;
    for (let k = 1; cm(PANEL, k) < PANEL.w; k++) {
      const x = cm(PANEL, k);
      lines++;
      expect(isBlack(img, 800, x, 3 + 0)).toBe(true);
      expect(isBlack(img, 800, x, 240 + (x === 240 ? 1 : 0))).toBe(true);
      expect(isBlack(img, 800, x - 1, 3)).toBe(false);
      expect(isBlack(img, 800, x + 1, 3)).toBe(false);
    }
    expect(lines).toBe(16);
    for (let k = 1; cm(PANEL, k) < PANEL.h; k++) {
      const y = cm(PANEL, k);
      expect(isBlack(img, 800, 3, y)).toBe(true);
      expect(isBlack(img, 800, 3, y - 1)).toBe(false);
      expect(isBlack(img, 800, 3, y + 1)).toBe(false);
    }
  });
});

describe("CA7 otro panel: 648 × 480, dpi 124", () => {
  const P: Panel = { w: 648, h: 480, dpi: 124, depth: 1 };

  it("bytes = 38880, zonas dentro del panel y cuadrícula del patrón en x = 49 y 98", async () => {
    const idx = await getIndex(app, P);
    expect(idx.panel).toEqual(P);
    expect(raw1Bytes(P)).toBe(38880);
    for (const view of idx.views) {
      expect(view.bytes).toBe(38880);
      const img = await getImage(app, view.id, view.hash, P);
      expect(img.length).toBe(38880);
      expect(view.crc32).toBe(crc32Hex(img));
      const zs = await getZones(app, view.id, view.hash, P); // validateZones: dentro del panel
      for (const z of zs.zones) {
        expect(z.x + z.w).toBeLessThanOrEqual(648);
        expect(z.y + z.h).toBeLessThanOrEqual(480);
      }
    }
    const img = await getImage(app, "patron", hashOf(idx, "patron"), P);
    expect(cm(P, 1)).toBe(49);
    expect(cm(P, 2)).toBe(98);
    expect(isBlack(img, 648, 49, 240)).toBe(true);
    expect(isBlack(img, 648, 48, 240)).toBe(false);
    expect(isBlack(img, 648, 50, 240)).toBe(false);
    expect(isBlack(img, 648, 98, 240)).toBe(true);
    expect(isBlack(img, 648, 97, 240)).toBe(false);
    expect(isBlack(img, 648, 99, 240)).toBe(false);
  });

  it("panel muy chico: toda zona dentro del panel y de al menos 8 px", async () => {
    const S: Panel = { w: 96, h: 64, dpi: 100, depth: 1 };
    const idx = await getIndex(app, S);
    expect(unit(S)).toBe(3);
    for (const view of idx.views) {
      expect(view.bytes).toBe(raw1Bytes(S));
      const zs = await getZones(app, view.id, view.hash, S);
      for (const z of zs.zones) {
        expect(z.w).toBeGreaterThanOrEqual(8);
        expect(z.h).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

describe("CA8 huella, 304, 409 y 404", () => {
  it("200 con cabeceras de imagen; 304 con If-None-Match; 409 con h vieja; 404 vista inexistente", async () => {
    const idx = await getIndex(app);
    const h = hashOf(idx, "demo");
    const ok = await app.inject({
      method: "GET",
      url: `${API}/views/demo/image?h=${h}`,
      headers: devHeaders(),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toContain("application/octet-stream");
    expect(ok.headers["content-length"]).toBe("48000");
    expect(ok.headers.etag).toBe(`"${h}"`);

    const nm = await app.inject({
      method: "GET",
      url: `${API}/views/demo/image?h=${h}`,
      headers: devHeaders(PANEL, { "If-None-Match": `"${h}"` }),
    });
    expect(nm.statusCode).toBe(304);
    expect(nm.rawPayload.length).toBe(0);

    for (const path of ["image", "zones"]) {
      const old = await app.inject({
        method: "GET",
        url: `${API}/views/demo/${path}?h=0000000000000000`,
        headers: devHeaders(),
      });
      expect(old.statusCode).toBe(409);
      const b = validateErrorBody(old.body);
      expect(b.ok && b.value.error.code).toBe("stale_view");

      const none = await app.inject({
        method: "GET",
        url: `${API}/views/nada/${path}?h=${h}`,
        headers: devHeaders(),
      });
      expect(none.statusCode).toBe(404);
      const b2 = validateErrorBody(none.body);
      expect(b2.ok && b2.value.error.code).toBe("unknown_view");
    }
  });

  it("la huella cambia solo si cambia el contenido", async () => {
    const a = await getIndex(app);
    const b = await getIndex(app);
    expect(b.views.map((v) => v.hash)).toEqual(a.views.map((v) => v.hash));
    expect(new Set(a.views.map((v) => v.hash)).size).toBe(3);
    const other = await getIndex(createApp(CFG).app);
    expect(other.views.map((v) => v.hash)).toEqual(a.views.map((v) => v.hash));
  });
});

describe("CA9 cabeceras inválidas → 400 invalid_request", () => {
  const cases: [string, Record<string, string | undefined>][] = [
    ["sin Tintero-Power", { "Tintero-Power": undefined }],
    ["Tintero-Formats: png1", { "Tintero-Formats": "png1" }],
    ["Tintero-Firmware de 65 caracteres", { "Tintero-Firmware": "a".repeat(65) }],
    [
      "Tintero-Formats de más de 64 caracteres",
      { "Tintero-Formats": Array(14).fill("raw1").join(",") },
    ],
    ["sin Tintero-Panel", { "Tintero-Panel": undefined }],
  ];
  for (const [name, over] of cases) {
    it(`GET index ${name}`, async () => {
      const r = await app.inject({
        method: "GET",
        url: `${API}/index`,
        headers: devHeaders(PANEL, over),
      });
      expect(r.statusCode).toBe(400);
      const b = validateErrorBody(r.body);
      expect(b.ok && b.value.error.code).toBe("invalid_request");
    });
  }

  it("todas las rutas validan las cabeceras", async () => {
    const idx = await getIndex(app);
    const h = hashOf(idx, "demo");
    const bad = devHeaders(PANEL, { "Tintero-Power": undefined });
    const reqs = [
      { method: "GET" as const, url: `${API}/views/demo/image?h=${h}` },
      { method: "GET" as const, url: `${API}/views/demo/zones?h=${h}` },
      {
        method: "POST" as const,
        url: `${API}/actions`,
        payload: JSON.stringify({
          actions: [{ id: "abcdefgh1", view: "demo", zone: "c1", act: "toggle", at: 1 }],
        }),
      },
      {
        method: "POST" as const,
        url: `${API}/log`,
        payload: JSON.stringify({ entries: [{ at: 1, level: "info", msg: "x" }] }),
      },
    ];
    for (const q of reqs) {
      const r = await app.inject({
        ...q,
        headers: { ...bad, "content-type": "application/json" },
      });
      expect(r.statusCode, q.url).toBe(400);
      const b = validateErrorBody(r.body);
      expect(b.ok && b.value.error.code).toBe("invalid_request");
    }
  });
});

describe("CA10 cuerpo de más de 4096 bytes que no es JSON → 413 too_large", () => {
  for (const route of ["actions", "log"]) {
    it(`POST ${route} con 5000 bytes`, async () => {
      const r = await app.inject({
        method: "POST",
        url: `${API}/${route}`,
        headers: { ...devHeaders(), "content-type": "application/json" },
        payload: "x".repeat(5000),
      });
      expect(r.statusCode).toBe(413);
      const b = validateErrorBody(r.body);
      expect(b.ok && b.value.error.code).toBe("too_large");
    });
  }
});

describe("CA12 otras rutas y métodos → 404 sin cuerpo", () => {
  const reqs: { method: "GET" | "DELETE" | "POST" | "PUT"; url: string }[] = [
    { method: "GET", url: "/" },
    { method: "GET", url: `${API}/otra` },
    { method: "DELETE", url: `${API}/index` },
    { method: "PUT", url: `${API}/actions` },
    { method: "POST", url: `${API}/index` },
  ];
  for (const withHeaders of [true, false]) {
    for (const q of reqs) {
      it(`${q.method} ${q.url} ${withHeaders ? "con" : "sin"} cabeceras`, async () => {
        const r = await app.inject({
          ...q,
          headers: withHeaders ? devHeaders() : {},
        });
        expect(r.statusCode).toBe(404);
        expect(r.rawPayload.length).toBe(0);
      });
    }
  }
});

describe("Presupuestos", () => {
  it("dibujar las tres vistas < 200 ms; índice e imagen en caché < 50 ms", async () => {
    const t0 = performance.now();
    const idx = await getIndex(app);
    for (const v of idx.views) await getImage(app, v.id, v.hash);
    expect(performance.now() - t0).toBeLessThan(200);
    const t1 = performance.now();
    await getIndex(app);
    expect(performance.now() - t1).toBeLessThan(50);
    const t2 = performance.now();
    await getImage(app, "demo", hashOf(idx, "demo"));
    expect(performance.now() - t2).toBeLessThan(50);
  });
});
