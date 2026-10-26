/* eslint-disable security/detect-non-literal-fs-filename -- dato grabado de esta carpeta */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIX17,
  NOW15,
  NOW_NOV2_17,
  P124,
  closeEngines15,
  fakeRenderer,
  index8,
  isBlack,
  launchChromium,
  mkEngine15,
  nearest,
  spacing,
  spyRenderer,
  styleChain,
  view8,
  type TestChromium,
} from "./helpers.ts";

/** HTML del dibujo completo de `hoy` (sin pixeles: renderer falso) con el reloj dado. */
async function hoyHtml(now: string): Promise<string> {
  const spy = spyRenderer(fakeRenderer());
  const e = mkEngine15(spy, { views: ["hoy"], clock: () => new Date(now) });
  await index8(e, "local", P124);
  await e.idle();
  const full = spy.calls.filter((c) => c.html.includes("data-fit="));
  const html = full[full.length - 1]?.html;
  if (html === undefined) throw new Error("no hubo dibujo completo");
  return html;
}

describe("CA1 estilo de la etiqueta del festivo", () => {
  it("FESTIVO LUN 2 NOV: peso 400 y espaciado 0; OCTUBRE 2026: peso 700 y 1px", async () => {
    const html = await hoyHtml(NOW15);
    const right = styleChain(html, "FESTIVO LUN 2 NOV");
    expect(right.length, "no hay un elemento con el texto FESTIVO LUN 2 NOV").toBeGreaterThan(0);
    expect(nearest(right, "font-weight") ?? "400").toBe("400");
    expect(spacing(nearest(right, "letter-spacing")) ?? "0").toBe("0");

    const left = styleChain(html, "OCTUBRE 2026");
    expect(left.length, "no hay un elemento con el texto OCTUBRE 2026").toBeGreaterThan(0);
    expect(nearest(left, "font-weight")).toBe("700");
    expect(spacing(nearest(left, "letter-spacing"))).toBe("1px");
  }, 60_000);

  it("con el reloj en 2026-11-02T13:00:00Z: HOY FESTIVO en 400 / 0 y NOVIEMBRE 2026 en 700 / 1px", async () => {
    const html = await hoyHtml(NOW_NOV2_17);
    const right = styleChain(html, "HOY FESTIVO");
    expect(right.length, "no hay un elemento con el texto HOY FESTIVO").toBeGreaterThan(0);
    expect(nearest(right, "font-weight") ?? "400").toBe("400");
    expect(spacing(nearest(right, "letter-spacing")) ?? "0").toBe("0");

    const left = styleChain(html, "NOVIEMBRE 2026");
    expect(left.length, "no hay un elemento con el texto NOVIEMBRE 2026").toBeGreaterThan(0);
    expect(nearest(left, "font-weight")).toBe("700");
    expect(spacing(nearest(left, "letter-spacing"))).toBe("1px");
  }, 60_000);
});

describe("CA2 y CA3 píxeles de la franja del mes", () => {
  let cr: TestChromium;
  let now: Uint8Array;
  // La imagen de `hoy` dibujada con el código de `main` antes de esta ficha, mismos datos y reloj.
  const before = new Uint8Array(readFileSync(`${FIX17}hoy-main-P124.raw1`));

  beforeAll(async () => {
    cr = await launchChromium();
    const e = mkEngine15(cr.renderer, { views: ["hoy"], clock: () => new Date(NOW15) });
    const { views } = await index8(e, "local", P124);
    await e.idle();
    now = view8(views, "hoy").raw1;
  }, 180_000);
  afterAll(async () => {
    await closeEngines15();
    await cr.stop();
  }, 120_000);

  const black = (img: Uint8Array, x: number, y: number): boolean => isBlack(img, P124.w, x, y);

  it("el dato grabado de main es una imagen de 800 × 480 con tinta en la franja del mes", () => {
    expect(before.length).toBe(Math.ceil(P124.w / 8) * P124.h);
    let ink = 0;
    for (let y = 250; y <= 268; y++)
      for (let x = 633; x <= 791; x++) if (black(before, x, y)) ink++;
    expect(ink).toBeGreaterThan(0);
  });

  it("CA2: la tinta de x 633–791, y 250–268 va de x 651 a x 784 y de y 255 a 264", () => {
    let minX = Infinity;
    let maxX = -Infinity;
    const rows = new Set<number>();
    for (let y = 250; y <= 268; y++)
      for (let x = 633; x <= 791; x++)
        if (black(now, x, y)) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          rows.add(y);
        }
    expect({ minX, maxX }).toEqual({ minX: 651, maxX: 784 });
    for (let y = 250; y <= 254; y++) expect(rows.has(y), `tinta en y=${String(y)}`).toBe(false);
    for (let y = 265; y <= 268; y++) expect(rows.has(y), `tinta en y=${String(y)}`).toBe(false);
    expect([...rows].some((y) => y >= 255 && y <= 264)).toBe(true);
    for (let y = 250; y <= 268; y++)
      for (let x = 633; x <= 650; x++)
        expect(black(now, x, y), `(${String(x)}, ${String(y)})`).toBe(false);
  });

  it("CA2: la raya del mes sigue en (600, 270) y (600, 271)", () => {
    expect(black(now, 600, 270)).toBe(true);
    expect(black(now, 600, 271)).toBe(true);
  });

  it("CA3: fuera de x 633–791, y 248–269 la imagen es igual a la de main", () => {
    const bad: string[] = [];
    for (let y = 0; y < P124.h; y++)
      for (let x = 0; x < P124.w; x++) {
        if (x >= 633 && x <= 791 && y >= 248 && y <= 269) continue;
        if (black(before, x, y) !== black(now, x, y)) bad.push(`(${String(x)}, ${String(y)})`);
      }
    expect(bad.slice(0, 10), `${String(bad.length)} píxeles distintos`).toEqual([]);
  });

  it("CA3: dentro del rectángulo sí cambia (la etiqueta ya no es la de main)", () => {
    let diff = 0;
    for (let y = 248; y <= 269; y++)
      for (let x = 633; x <= 791; x++) if (black(before, x, y) !== black(now, x, y)) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});
