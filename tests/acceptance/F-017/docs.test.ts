import { describe, expect, it } from "vitest";
import { readRepo } from "./helpers.ts";

describe("CA8 documentación", () => {
  it("server/README.md nombra --next-wake-usb-s con su valor por defecto 600", () => {
    const lines = readRepo("server/README.md").split("\n");
    const hit = lines.filter((l) => l.includes("--next-wake-usb-s"));
    expect(hit.length, "ninguna línea nombra --next-wake-usb-s").toBeGreaterThan(0);
    expect(hit.some((l) => l.includes("600"))).toBe(true);
  });

  it("firmware/README.md dice que next_wake_s cambia con Tintero-Power (600 usb, 1800 battery)", () => {
    const lines = readRepo("firmware/README.md").split("\n");
    const ok = lines.some((l, i) => {
      if (!l.includes("next_wake_s") || !l.includes("Tintero-Power")) return false;
      const near = lines.slice(Math.max(0, i - 1), i + 2).join(" ");
      return (
        near.includes("600") &&
        near.includes("1800") &&
        near.includes("usb") &&
        near.includes("battery")
      );
    });
    expect(ok, "ninguna línea junta next_wake_s, Tintero-Power, usb/600 y battery/1800").toBe(true);
  });
});
