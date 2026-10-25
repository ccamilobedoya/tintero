import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  chromiumDockerArgs,
  removeOrphanChromium,
  startChromium,
} from "../../../server/src/engine/chromium.ts";
import { docker, forceRemove, labelled, launchSleeper, running } from "./helpers.ts";

const tag = (): string => `tintero-f010-test-${randomBytes(4).toString("hex")}`;

describe("CA1 etiqueta", () => {
  it("--label tintero.chromium=1 va antes de la imagen", () => {
    const image = "img@sha256:abc";
    const args = chromiumDockerArgs("tintero-chromium-abcd1234", 0, "/tmp/f", image);
    const at = args.indexOf("--label");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(args[at + 1]).toBe("tintero.chromium=1");
    expect(at + 1).toBeLessThan(args.indexOf(image));
  });
});

describe("Docker real", () => {
  const made: string[] = [];
  afterEach(() => {
    forceRemove(made.splice(0));
  });

  function precondition(): void {
    expect(labelled(), "hay contenedores con la etiqueta ajenos a la prueba").toEqual([]);
  }

  it("CA2 borra solo los etiquetados y registra la línea", async () => {
    precondition();
    const a = tag();
    const b = tag();
    const c = tag();
    made.push(a, b, c);
    launchSleeper(a, true);
    launchSleeper(b, true);
    launchSleeper(c, false);
    expect(labelled()).toHaveLength(2);
    const lines: Record<string, unknown>[] = [];
    const n = await removeOrphanChromium({ log: (l) => lines.push(l) });
    expect(n).toBe(2);
    expect(labelled()).toEqual([]);
    expect(running(a)).toBe(false);
    expect(running(b)).toBe(false);
    expect(running(c)).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ event: "chromium", action: "orphans", count: 2 });
    expect(lines[0]).toHaveProperty("ts");
  }, 120_000);

  it("CA2 sin etiquetados devuelve 0 y no registra", async () => {
    precondition();
    const c = tag();
    made.push(c);
    launchSleeper(c, false);
    const lines: Record<string, unknown>[] = [];
    const n = await removeOrphanChromium({ log: (l) => lines.push(l) });
    expect(n).toBe(0);
    expect(lines).toEqual([]);
    expect(running(c)).toBe(true);
  }, 120_000);

  it("CA3 startChromium deja exactamente 1 contenedor etiquetado (el nuevo)", async () => {
    precondition();
    const old = tag();
    made.push(old);
    launchSleeper(old, true);
    expect(labelled()).toHaveLength(1);
    const chromium = await startChromium();
    made.push(chromium.name);
    try {
      expect(running(old)).toBe(false);
      const ids = labelled();
      expect(ids).toHaveLength(1);
      const name = docker(["inspect", "--format", "{{.Name}}", ids[0] ?? "x"]).trim();
      expect(name).toBe(`/${chromium.name}`);
    } finally {
      await chromium.stop();
    }
  }, 180_000);
});
