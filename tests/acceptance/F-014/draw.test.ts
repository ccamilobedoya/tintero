import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  NOW_NOV1,
  NOW_OCT27,
  P124,
  closeAgendaEngines,
  drawAgenda,
  holidays2026,
  inkIn,
  launchChromium,
  pixelErrors,
  zoneRects,
  type DrawnAgenda,
  type TestChromium,
} from "./helpers.ts";

let cr: TestChromium;
let oct27: DrawnAgenda;
let nov1On: DrawnAgenda;
let nov1Off: DrawnAgenda;

beforeAll(async () => {
  cr = await launchChromium();
  oct27 = await drawAgenda(cr, { now: NOW_OCT27, holidays: true });
  nov1On = await drawAgenda(cr, { now: NOW_NOV1, holidays: true });
  nov1Off = await drawAgenda(cr, { now: NOW_NOV1, holidays: false });
}, 300_000);
afterAll(async () => {
  await closeAgendaEngines();
  await cr.stop();
}, 120_000);

const W = P124.w;
const holidayName = (): string => {
  const h = holidays2026().find((x) => x.date === "2026-11-02");
  if (!h) throw new Error("el festivo del 2 de noviembre no está en la fixture");
  return h.name;
};

describe("CA10 agenda con pictogramas (2026-10-27T13:00:00Z)", () => {
  it("8 zonas de 480 × 30 en las filas esperadas", () => {
    expect(zoneRects(oct27.view)).toEqual(
      [92, 122, 174, 204, 234, 286, 316, 368].map((y) => [8, y, 480, 30]),
    );
  });

  it("casa, maletín, pastel y persona en su columna", () => {
    const bad = pixelErrors(
      oct27.view.raw1,
      W,
      [
        // casa (origen 14, 99)
        [22, 104],
        [18, 111],
        [26, 111],
        // maletín (origen 14, 129)
        [22, 139],
        [19, 132],
        [24, 132],
        [22, 130],
        // pastel (origen 14, 181)
        [22, 193],
        [22, 187],
        [22, 183],
        // persona (origen 14, 241)
        [22, 245],
        [22, 254],
        [16, 256],
      ],
      [
        [22, 111],
        [15, 111],
        [22, 133],
        [22, 129],
        [18, 187],
        [14, 193],
        [22, 249],
        [14, 249],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("la banda de foco sigue en blanco", () => {
    expect(oct27.view.bandInk).toEqual([]);
  });
});

describe("CA11 festivo con la estrella (2026-11-01T13:00:00Z, holidays: true)", () => {
  it("2 zonas; el festivo no es zona", () => {
    expect(zoneRects(nov1On.view)).toEqual([
      [8, 92, 480, 30],
      [8, 174, 480, 30],
    ]);
  });

  it("estrella del festivo y corazón de a12", () => {
    const bad = pixelErrors(
      nov1On.view.raw1,
      W,
      [
        // estrella (origen 14, 151)
        [22, 158],
        [22, 152],
        [17, 165],
        // corazón (origen 14, 181)
        [22, 189],
        [18, 185],
        [22, 193],
      ],
      [
        [15, 152],
        [28, 165],
        [22, 182],
        [15, 195],
      ],
    );
    expect(bad).toEqual([]);
  });

  it("el HTML trae el nombre del festivo", () => {
    expect(nov1On.html).toContain(holidayName());
  });
});

describe("CA12 el mismo caso con holidays: false", () => {
  it("2 zonas: {8,92} y {8,144}", () => {
    expect(zoneRects(nov1Off.view)).toEqual([
      [8, 92, 480, 30],
      [8, 144, 480, 30],
    ]);
  });

  it("el corazón subió una fila; donde estaba no queda nada", () => {
    expect(pixelErrors(nov1Off.view.raw1, W, [[22, 159]], [])).toEqual([]);
    expect(inkIn(nov1Off.view.raw1, W, { x0: 14, x1: 29, y0: 176, y1: 199 })).toBe(0);
  });

  it("el HTML no trae el nombre del festivo", () => {
    expect(nov1Off.html).not.toContain(holidayName());
  });
});
