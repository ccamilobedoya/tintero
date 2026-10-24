import { describe, expect, it } from "vitest";
import { chromiumDockerArgs, slotRects } from "../../../server/src/engine/index.ts";
import { P124, V124, cfgFrom } from "./helpers.ts";

describe("CA4 rectángulos", () => {
  const hoy = cfgFrom().views.find((v) => v.id === "hoy");

  it("cuadrícula de hoy en P124, en el orden de Tab", () => {
    expect(hoy).toBeDefined();
    if (!hoy) return;
    expect(slotRects(hoy.grid, P124)).toEqual([
      { area: "pendientes", x: 0, y: 36, w: 400, h: 244 },
      { area: "eventos", x: 402, y: 36, w: 398, h: 244 },
      { area: "jira", x: 0, y: 282, w: 400, h: 198 },
      { area: "calendario", x: 402, y: 282, w: 398, h: 198 },
    ]);
  });

  it("portrait en V124", () => {
    expect(hoy?.portrait).toBeDefined();
    if (!hoy?.portrait) return;
    const rects = slotRects(hoy.portrait, V124);
    expect(rects.find((r) => r.area === "pendientes")).toEqual({
      area: "pendientes",
      x: 0,
      y: 36,
      w: 480,
      h: 267,
    });
    expect(rects.find((r) => r.area === "eventos")).toEqual({
      area: "eventos",
      x: 0,
      y: 305,
      w: 480,
      h: 189,
    });
  });
});

describe("CA5 contenedor", () => {
  const args = chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc");

  it("contiene lo que la ficha exige", () => {
    for (const piece of [
      "-p",
      "127.0.0.1:0:9222",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "512m",
      "--pids-limit",
      "256",
      "--mount",
      "type=bind,source=/f,target=/tintero/fonts,readonly",
      "img@sha256:abc",
    ])
      expect(args, piece).toContain(piece);
  });

  it("no contiene lo prohibido", () => {
    for (const piece of ["-v", "--privileged", "--network", "host"])
      expect(args).not.toContain(piece);
    expect(args.join(" ")).not.toContain("0.0.0.0");
  });

  it("la imagen va antes de los parámetros de Chromium", () => {
    const i = args.indexOf("img@sha256:abc");
    expect(i).toBeGreaterThan(0);
    expect(args.slice(i + 1)).toEqual(
      expect.arrayContaining([
        "--font-render-hinting=full",
        "--disable-font-subpixel-positioning",
        "--disable-lcd-text",
      ]),
    );
  });
});
