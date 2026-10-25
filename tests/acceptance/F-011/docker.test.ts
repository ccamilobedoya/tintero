import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chromiumDockerArgs,
  startChromiumService,
  waitForDocker,
} from "../../../server/src/engine/chromium.ts";
import { delimiter } from "node:path";
import { makeFakeDocker, type FakeDocker, type Line } from "./helpers.ts";

let fake: FakeDocker | undefined;
let savedPath: string | undefined;

beforeEach(() => {
  savedPath = process.env.PATH;
});
afterEach(() => {
  process.env.PATH = savedPath;
  fake?.cleanup();
  fake = undefined;
});

/** Pone el Docker falso primero en el PATH del proceso (el real ya se resolvió). */
function useFake(failures: number, guard = false): FakeDocker {
  const made = makeFakeDocker(failures, guard);
  fake = made;
  process.env.PATH = `${made.dir}${delimiter}${savedPath ?? ""}`;
  return made;
}

/** Reloj y `sleep` virtuales: pedir una espera adelanta el reloj, sin esperar de verdad. */
function virtualTime(): {
  clock: () => Date;
  sleep: (ms: number) => Promise<void>;
  waits: number[];
} {
  const base = Date.parse("2026-10-25T10:00:00Z");
  let elapsed = 0;
  const waits: number[] = [];
  return {
    waits,
    clock: () => new Date(base + elapsed),
    sleep: (ms) => {
      waits.push(ms);
      elapsed += ms;
      return Promise.resolve();
    },
  };
}

const dockerLines = (lines: Line[]): Line[] => lines.filter((l) => l.event === "docker");

describe("CA1 espera a Docker", () => {
  it("N = 3: resuelve tras 4 llamadas a version; esperas 1000, 2000, 4000; una línea false y una true", async () => {
    const f = useFake(3);
    const lines: Line[] = [];
    const time = virtualTime();
    await waitForDocker({ log: (l) => lines.push(l), clock: time.clock, sleep: time.sleep });
    expect(f.versionCalls()).toBe(4);
    expect(f.calls().filter((c) => c[0] === "version")).toHaveLength(4);
    expect(time.waits).toEqual([1000, 2000, 4000]);
    const docker = dockerLines(lines);
    expect(docker.filter((l) => l.ok === false)).toHaveLength(1);
    const good = docker.filter((l) => l.ok === true);
    expect(good).toHaveLength(1);
    expect(good[0]).toHaveProperty("waitedS");
    expect(typeof good[0]?.waitedS).toBe("number");
    expect(good[0]).toHaveProperty("ts");
    expect(docker[0]).toHaveProperty("ts");
    // el false sale antes que el true
    expect(docker.map((l) => l.ok)).toEqual([false, true]);
  });

  it("sin fallos: una llamada, ninguna espera y ninguna línea", async () => {
    const f = useFake(0);
    const lines: Line[] = [];
    const time = virtualTime();
    await waitForDocker({ log: (l) => lines.push(l), clock: time.clock, sleep: time.sleep });
    expect(f.versionCalls()).toBe(1);
    expect(time.waits).toEqual([]);
    expect(dockerLines(lines)).toEqual([]);
  });

  it("la espera crece 1, 2, 4, 8, 16, 32 y se queda en 60 s; un registro de fallo por hora", async () => {
    const f = useFake(70);
    const lines: Line[] = [];
    const time = virtualTime();
    await waitForDocker({ log: (l) => lines.push(l), clock: time.clock, sleep: time.sleep });
    expect(f.versionCalls()).toBe(71);
    expect(time.waits.slice(0, 9)).toEqual([
      1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
    expect(time.waits.every((w) => w <= 60_000)).toBe(true);
    expect(time.waits.slice(6).every((w) => w === 60_000)).toBe(true);
    const failed = dockerLines(lines).filter((l) => l.ok === false);
    // 70 fallos ≈ 3903 s: el primero y uno una hora después (no más)
    expect(failed).toHaveLength(2);
    const gap = Date.parse(String(failed[1]?.ts)) - Date.parse(String(failed[0]?.ts));
    expect(gap).toBeGreaterThanOrEqual(3_600_000);
    const good = dockerLines(lines).filter((l) => l.ok === true);
    expect(good).toHaveLength(1);
    expect(good[0]?.waitedS).toBeGreaterThanOrEqual(3900);
  }, 60_000);

  it("con una señal abortada deja de reintentar", async () => {
    useFake(1000);
    const controller = new AbortController();
    const waits: number[] = [];
    const settled = waitForDocker({
      log: () => undefined,
      sleep: (ms) => {
        waits.push(ms);
        if (waits.length === 3) controller.abort();
        return Promise.resolve();
      },
      signal: controller.signal,
    }).then(
      () => "resolved",
      () => "rejected",
    );
    const outcome = await Promise.race([
      settled,
      new Promise<string>((resolve) =>
        setTimeout(() => {
          resolve("sigue reintentando");
        }, 10_000),
      ),
    ]);
    expect(outcome).not.toBe("sigue reintentando");
    expect(waits.length).toBeLessThan(10);
  }, 30_000);
});

describe("CA3 sin bajar imágenes", () => {
  const image = "img@sha256:abc";
  const name = "tintero-chromium-abcd1234";

  it("chromiumDockerArgs lleva --pull never antes de la imagen (con y sin instancia)", () => {
    for (const instance of [undefined, "prueba-a"]) {
      const args = chromiumDockerArgs(name, 0, "/tmp/f", image, instance);
      const end = args.indexOf(image);
      const pull = args.indexOf("--pull");
      expect(end).toBeGreaterThan(0);
      expect(pull).toBeGreaterThan(-1);
      expect(args[pull + 1]).toBe("never");
      expect(pull + 1).toBeLessThan(end);
      expect(args).toContain("tintero.chromium=1");
    }
  });

  it("imagen inexistente: línea image-missing tras la primera espera, sin pull ni run", async () => {
    const f = useFake(0, true);
    const image404 = "tintero-imagen-que-no-existe:0";
    const lines: Line[] = [];
    const base = Date.parse("2026-10-25T10:00:00Z");
    const waits: number[] = [];
    let hang: Promise<void> | undefined;
    const sleep = (ms: number): Promise<void> => {
      waits.push(ms);
      // la primera espera no espera; a partir de la segunda se queda esperando para parar el bucle
      if (waits.length >= 2) {
        hang = new Promise<void>(() => undefined);
        return hang;
      }
      return Promise.resolve();
    };
    // El bucle no termina por sí solo: se abandona al colgar `sleep`.
    void startChromiumService({
      image: image404,
      log: (l) => lines.push(l),
      clock: () => new Date(base),
      sleep,
    }).catch(() => undefined);
    const end = Date.now() + 60_000;
    while (waits.length < 2 && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(waits.length).toBeGreaterThanOrEqual(2);
    const missing = lines.filter(
      (l) => l.event === "chromium" && l.action === "start" && l.ok === false,
    );
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      event: "chromium",
      action: "start",
      ok: false,
      code: "image-missing",
    });
    const calls = f.calls();
    expect(calls.some((c) => c[0] === "image" && c[1] === "inspect" && c.includes(image404))).toBe(
      true,
    );
    expect(calls.filter((c) => c[0] === "pull" || (c[0] === "image" && c[1] === "pull"))).toEqual(
      [],
    );
    expect(calls.filter((c) => c[0] === "run" && c.includes(image404))).toEqual([]);
    expect(calls.filter((c) => c.includes("--pull") && c.includes("always"))).toEqual([]);
  }, 90_000);
});
