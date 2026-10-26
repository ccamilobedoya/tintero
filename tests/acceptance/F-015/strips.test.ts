/* eslint-disable security/detect-non-literal-fs-filename -- dato grabado de esta carpeta */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FIXTURES,
  NOW,
  P124,
  closeEngines15,
  index8,
  isBlack,
  launchChromium,
  mkEngine6,
  view8,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
let now: Uint8Array;
const before = new Uint8Array(readFileSync(`${FIXTURES}hoy-main-P124.raw1`));

beforeAll(async () => {
  cr = await launchChromium();
  const e = mkEngine6(cr.renderer, { views: ["hoy"], clock: () => new Date(NOW) });
  const { views } = await index8(e, "local", P124);
  await e.idle();
  now = view8(views, "hoy").raw1;
  await e.close();
}, 180_000);
afterAll(async () => {
  await closeEngines15();
  await cr.stop();
}, 120_000);

/** Pixels that differ between two bands of the same width (rows `y0..y0+23` of `a` and `y1..y1+23` of `b`), x 0–495. */
function diff(a: Uint8Array, ya: number, b: Uint8Array, yb: number): string[] {
  const bad: string[] = [];
  for (let dy = 0; dy < 24; dy++)
    for (let x = 0; x <= 495; x++)
      if (isBlack(a, P124.w, x, ya + dy) !== isBlack(b, P124.w, x, yb + dy))
        bad.push(`(${String(x)}, ${String(dy)})`);
  return bad;
}

describe("CA12 las franjas de tareas quedan iguales píxel a píxel", () => {
  it("el dato grabado de main es una imagen de 800 × 480 con las dos franjas", () => {
    expect(before.length).toBe(Math.ceil(P124.w / 8) * P124.h);
    expect(isBlack(before, P124.w, 300, 46)).toBe(true); // la franja que manda, negra
    expect(isBlack(before, P124.w, 200, 285)).toBe(true); // la raya de Por hacer en main
    expect(isBlack(before, P124.w, 200, 265)).toBe(false);
  });

  it("la franja que manda (y 46–69) es igual a la de main", () => {
    const bad = diff(before, 46, now, 46);
    expect(bad.slice(0, 10), `${String(bad.length)} píxeles distintos`).toEqual([]);
    expect(isBlack(now, P124.w, 300, 46)).toBe(true);
  });

  it("la franja de Por hacer es igual, 20 px más arriba (main y 263–286; ahora y 243–266)", () => {
    const bad = diff(before, 263, now, 243);
    expect(bad.slice(0, 10), `${String(bad.length)} píxeles distintos`).toEqual([]);
    expect(isBlack(now, P124.w, 200, 265)).toBe(true);
    expect(isBlack(now, P124.w, 200, 285)).toBe(false);
  });
});
