import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { scenario, tmp, type Scenario, type Tmp } from "../F-009/helpers.ts";

let t: Tmp;
let s: Scenario | undefined;

beforeAll(() => {
  t = tmp();
});
afterEach(async () => {
  if (s) {
    await s.close();
    s = undefined;
  }
});
afterAll(() => {
  t.cleanup();
});

const ATTR = "/etapi/attributes/atrstatus001";

describe("CA14 Trilium recibe la etapa siguiente", () => {
  it("tres toggle sobre una tarjeta de Por hacer: En progreso, Hecho, Por hacer", async () => {
    s = await scenario(t);
    const sc = s;
    await sc.tt.cycle();
    expect(sc.fake.statusOf("tarjeta00001")).toBe("Por hacer");
    let n = 0;
    for (const name of ["En progreso", "Hecho", "Por hacer"]) {
      await sc.refresh();
      expect(sc.toggle("tarjeta00001")).toEqual({ status: "applied", changed: true });
      await sc.tt.idle();
      n++;
      expect(sc.patches()).toHaveLength(n);
      expect(sc.patches().at(-1)).toEqual({ path: ATTR, body: `{"value":"${name}"}` });
      expect(sc.fake.statusOf("tarjeta00001")).toBe(name);
    }
  }, 60_000);

  it("dos toggle seguidos con el falso lento (300 ms): a lo sumo 2 PATCH y termina en Hecho", async () => {
    s = await scenario(t);
    const sc = s;
    await sc.tt.cycle();
    await sc.refresh();
    sc.fake.delayMs = 300;
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.refresh();
    expect(sc.toggle("tarjeta00001").status).toBe("applied");
    await sc.tt.idle();
    expect(sc.patches().length).toBeLessThanOrEqual(2);
    expect(sc.fake.statusOf("tarjeta00001")).toBe("Hecho");
  }, 60_000);
});
