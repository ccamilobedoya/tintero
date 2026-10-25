import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  chromiumDockerArgs,
  removeOrphanChromium,
  startChromium,
} from "../../../server/src/engine/chromium.ts";
import { REPO, docker, forceRemove, labelled, launchSleeper, running } from "./helpers.ts";

const hex = (): string => randomBytes(4).toString("hex");
const tag = (): string => `tintero-f010-test-${hex()}`;

function labelValues(args: string[]): (string | undefined)[] {
  return args.flatMap((a, i) => (a === "--label" ? [args[i + 1]] : []));
}

describe("CA1 etiquetas", () => {
  const image = "img@sha256:abc";
  const name = "tintero-chromium-abcd1234";

  it("con instancia: las dos etiquetas van antes de la imagen", () => {
    const args = chromiumDockerArgs(name, 0, "/tmp/f", image, "prueba-a");
    const end = args.indexOf(image);
    expect(end).toBeGreaterThan(0);
    const values = labelValues(args);
    expect(values).toContain("tintero.chromium=1");
    expect(values).toContain("tintero.instance=prueba-a");
    args.forEach((a, i) => {
      if (a === "--label") expect(i + 1).toBeLessThan(end);
    });
  });

  it("sin instancia: solo la etiqueta base", () => {
    const args = chromiumDockerArgs(name, 0, "/tmp/f", image);
    expect(labelValues(args)).toEqual(["tintero.chromium=1"]);
    expect(args.indexOf("--label") + 1).toBeLessThan(args.indexOf(image));
  });

  it("instancia inválida lanza", () => {
    expect(() => chromiumDockerArgs(name, 0, "/tmp/f", image, "Prueba A")).toThrow();
  });
});

describe("Docker real", () => {
  const made: string[] = [];
  afterEach(() => {
    forceRemove(made.splice(0));
  });

  it("CA2 borra solo los de la misma instancia y registra la línea", async () => {
    const instA = `f010-a-${hex()}`;
    const instB = `f010-b-${hex()}`;
    const a1 = tag();
    const a2 = tag();
    const b = tag();
    const plain = tag();
    made.push(a1, a2, b, plain);
    launchSleeper(a1, instA);
    launchSleeper(a2, instA);
    launchSleeper(b, instB);
    launchSleeper(plain, undefined, false);
    expect(labelled(instA)).toHaveLength(2);
    const lines: Record<string, unknown>[] = [];
    const n = await removeOrphanChromium(instA, { log: (l) => lines.push(l) });
    expect(n).toBe(2);
    expect(labelled(instA)).toEqual([]);
    expect(running(a1)).toBe(false);
    expect(running(a2)).toBe(false);
    expect(running(b)).toBe(true);
    expect(running(plain)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "chromium", action: "orphans", count: 2 });
    expect(lines[0]).toHaveProperty("ts");

    const again: Record<string, unknown>[] = [];
    expect(await removeOrphanChromium(instA, { log: (l) => again.push(l) })).toBe(0);
    expect(again).toEqual([]);
    expect(running(b)).toBe(true);
  }, 120_000);

  it("CA2 nombre inválido lanza", async () => {
    await expect(removeOrphanChromium("Mal Nombre")).rejects.toThrow();
  });

  it("CA3 startChromium con instancia deja 1 de la suya y respeta la otra", async () => {
    const instA = `f010-a-${hex()}`;
    const instB = `f010-b-${hex()}`;
    const oldA = tag();
    const otherB = tag();
    made.push(oldA, otherB);
    launchSleeper(oldA, instA);
    launchSleeper(otherB, instB);
    const chromium = await startChromium({ instance: instA });
    made.push(chromium.name);
    try {
      expect(running(oldA)).toBe(false);
      expect(running(otherB)).toBe(true);
      const ids = labelled(instA);
      expect(ids).toHaveLength(1);
      const name = docker(["inspect", "--format", "{{.Name}}", ids[0] ?? "x"]).trim();
      expect(name).toBe(`/${chromium.name}`);
    } finally {
      await chromium.stop();
    }
  }, 180_000);

  it("CA3 startChromium sin instancia no borra ninguno", async () => {
    const instA = `f010-a-${hex()}`;
    const old = tag();
    made.push(old);
    launchSleeper(old, instA);
    const chromium = await startChromium();
    made.push(chromium.name);
    try {
      expect(running(old)).toBe(true);
    } finally {
      await chromium.stop();
    }
  }, 180_000);
});

describe("CA3 servidor", () => {
  it("--instance con nombre inválido sale con 2", () => {
    const r = spawnSync(
      process.execPath,
      [
        "server/src/main.ts",
        "--instance",
        "Mal Nombre",
        "--views",
        "config/tablero.views.example.json",
        "--data",
        "config/tablero.data.example.json",
      ],
      { cwd: REPO, encoding: "utf8", timeout: 60_000, maxBuffer: 1_048_576 },
    );
    expect(r.status).toBe(2);
  });
});
