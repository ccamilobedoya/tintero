// Chromium in Docker and the CDP connection (sensitive zone, ADR-0031, docs/seguridad.md).
// CDP goes over plain HTTP to 127.0.0.1 only: `cdpBase` is the single place that builds and
// validates that URL, and the two calls that use it are the only ones marked `nosemgrep`.
import { execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import type { Panel } from "../../../contract/src/index.ts";
import { readCapped } from "../tls.ts";
import { countGray, decodePng, toRaw1 } from "./png.ts";

export interface Box {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface RenderOutput {
  raw1: Uint8Array;
  /** Pixels of the capture that were neither pure black nor pure white (before the threshold). */
  gray: number;
  boxes: Box[];
  overflow: string[];
}
export interface RenderOptions {
  /** `low` starts only when no `normal` draw is waiting. Default `normal`. */
  priority?: "normal" | "low";
}
export interface Renderer {
  render(html: string, panel: Panel, options?: RenderOptions): Promise<RenderOutput>;
  /** Requests the page tried to make and that were blocked, since the renderer was created. */
  blockedRequests(): number;
  close(): Promise<void>;
}

/**
 * Runs tasks one at a time. A `low` task starts only when no `normal` one is waiting; a
 * `normal` one waits at most for a `low` that already started.
 */
export function priorityQueue(): <T>(
  task: () => Promise<T>,
  priority?: "normal" | "low",
) => Promise<T> {
  const normal: (() => void)[] = [];
  const low: (() => void)[] = [];
  let active = false;
  const next = (): void => {
    const start = normal.shift() ?? low.shift();
    if (start) start();
    else active = false;
  };
  return <T>(task: () => Promise<T>, priority: "normal" | "low" = "normal"): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const start = (): void => {
        task().then(resolve, reject).finally(next);
      };
      if (!active) {
        active = true;
        start();
      } else (priority === "low" ? low : normal).push(start);
    });
}

export const CHROMIUM_LABEL = "tintero.chromium=1";
export const INSTANCE_NAME = /^[a-z0-9-]{1,32}$/;
const INSTANCE_LABEL = "tintero.instance=";
const CONTAINER_ID = /^[0-9a-f]{12,64}$/;

function assertInstance(instance: string): void {
  if (!INSTANCE_NAME.test(instance)) throw new Error("invalid instance name");
}

const CDP_BASE = /^http:\/\/127\.0\.0\.1:([0-9]{1,5})$/;
const CONTAINER_NAME = /^tintero-chromium-[0-9a-f]{8}$/;
const START_TIMEOUT_MS = 30_000;
const DOCKER_OUTPUT_MAX = 65_536;
const IMAGES_CONF_MAX = 16_384;

/** Accepts only `http://127.0.0.1:<port>`; returns it without a trailing path. */
export function cdpBase(endpoint: string): string {
  const match = CDP_BASE.exec(endpoint);
  const port = Number(match?.[1]);
  if (!match || port < 1 || port > 65_535)
    throw new Error("the endpoint must be http://127.0.0.1:<port>");
  return `http://127.0.0.1:${port}`;
}

export function chromiumDockerArgs(
  name: string,
  port: number,
  fontsDir: string,
  image: string,
  instance?: string,
): string[] {
  if (instance !== undefined) assertInstance(instance);
  return [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
    "--label",
    CHROMIUM_LABEL,
    ...(instance === undefined ? [] : ["--label", `${INSTANCE_LABEL}${instance}`]),
    "-p",
    `127.0.0.1:${port}:9222`,
    "--read-only",
    "--tmpfs",
    "/tmp:size=64m",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    "--memory",
    "512m",
    "--pids-limit",
    "256",
    "--mount",
    `type=bind,source=${fontsDir},target=/tintero/fonts,readonly`,
    "-e",
    "FONTCONFIG_FILE=/tintero/fonts/fonts.conf",
    "--pull",
    "never",
    image,
    "--font-render-hinting=full",
    "--disable-font-subpixel-positioning",
    "--disable-lcd-text",
  ];
}

function docker(args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    // No shell: the arguments reach `docker` as they are.
    execFile(
      "docker",
      args,
      { timeout: timeoutMs, maxBuffer: DOCKER_OUTPUT_MAX, windowsHide: true },
      (error, stdout) => {
        if (error) reject(new Error(`docker ${args[0] ?? ""} failed`, { cause: error }));
        else resolve(stdout);
      },
    );
  });
}

/** Ids from `docker ps -aq`: one per line, each 12–64 hex characters; anything else throws. */
export function parseContainerIds(output: string): string[] {
  const ids = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  for (const id of ids) {
    if (!CONTAINER_ID.test(id)) throw new Error("unexpected container id");
  }
  return ids;
}

/** Removes the Chromium containers of one instance left by a crash (both labels must match). */
export async function removeOrphanChromium(
  instance: string,
  options: { log?: (line: Record<string, unknown>) => void } = {},
): Promise<number> {
  assertInstance(instance);
  const ids = parseContainerIds(
    await docker([
      "ps",
      "-aq",
      "--filter",
      `label=${CHROMIUM_LABEL}`,
      "--filter",
      `label=${INSTANCE_LABEL}${instance}`,
    ]),
  );
  if (ids.length === 0) return 0;
  await docker(["rm", "-f", ...ids]);
  options.log?.({
    ts: new Date().toISOString(),
    event: "chromium",
    action: "orphans",
    count: ids.length,
  });
  return ids.length;
}

/**
 * Stops a container. Detached (own process group, no stdio) so that a Ctrl+C that reaches the
 * whole group of the server does not kill `docker stop` before it finishes.
 */
export function stopContainer(
  name: string,
  spawnFn: typeof spawn = spawn,
  timeoutMs = 20_000,
): Promise<void> {
  return new Promise((resolve) => {
    if (!CONTAINER_NAME.test(name)) {
      resolve();
      return;
    }
    try {
      const child = spawnFn("docker", ["stop", "--time", "2", name], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      const timer = setTimeout(resolve, timeoutMs);
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      child.once("error", done); // docker missing or gone: nothing else to do
      child.once("exit", done);
    } catch {
      resolve();
    }
  });
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Asks `/json/version` of the local Chromium; the body is never read. */
async function answers(endpoint: string): Promise<boolean> {
  try {
    const base = cdpBase(endpoint);
    // nosemgrep: react-insecure-request -- CDP local (docs/seguridad.md)
    const response = await fetch(`${base}/json/version`, { signal: AbortSignal.timeout(2000) });
    response.body?.cancel().catch(() => undefined);
    return response.ok;
  } catch {
    return false;
  }
}

function connectCdp(endpoint: string): Promise<Browser> {
  // nosemgrep: react-insecure-request -- CDP local (docs/seguridad.md)
  return chromium.connectOverCDP(cdpBase(endpoint), { timeout: 10_000 });
}

function chromiumImage(): string {
  const path = fileURLToPath(new URL("../../../tools/images.conf", import.meta.url));
  const text = readCapped(path, IMAGES_CONF_MAX).toString("utf8");
  const found = /^CHROMIUM_IMAGE=(\S+)/m.exec(text);
  if (!found?.[1]) throw new Error("CHROMIUM_IMAGE is missing in tools/images.conf");
  return found[1];
}

export async function startChromium(
  options: {
    port?: number;
    instance?: string;
    log?: (line: Record<string, unknown>) => void;
  } = {},
): Promise<{ endpoint: string; name: string; stop(): Promise<void> }> {
  const { instance } = options;
  if (instance !== undefined) {
    await removeOrphanChromium(instance, { ...(options.log ? { log: options.log } : {}) });
  }
  return runChromium(chromiumImage(), options.port ?? 0, instance);
}

/** Starts one container and waits for its Chromium to answer; stops it if it never does. */
async function runChromium(
  image: string,
  port: number,
  instance?: string,
): Promise<{ endpoint: string; name: string; stop(): Promise<void> }> {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("invalid port");
  const name = `tintero-chromium-${randomBytes(4).toString("hex")}`;
  if (!CONTAINER_NAME.test(name)) throw new Error("invalid container name");
  const fontsDir = fileURLToPath(new URL("../../fonts", import.meta.url));
  await docker(chromiumDockerArgs(name, port, fontsDir, image, instance), START_TIMEOUT_MS);
  const stop = (): Promise<void> => stopContainer(name);
  try {
    const mapped = (await docker(["port", name, "9222/tcp"])).split("\n")[0] ?? "";
    const found = /^127\.0\.0\.1:([0-9]{1,5})$/.exec(mapped.trim());
    if (!found) throw new Error("cannot read the published port");
    const endpoint = `http://127.0.0.1:${Number(found[1])}`;
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (!(await answers(endpoint))) {
      if (Date.now() > deadline) throw new Error("Chromium did not answer in time");
      await sleep(150);
    }
    return { endpoint, name, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

interface ElementLike {
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { x: number; y: number; width: number; height: number };
  scrollHeight: number;
  clientHeight: number;
  scrollWidth: number;
  clientWidth: number;
}

export async function chromiumRenderer(
  endpoint: string,
  options: { timeoutMs?: number } = {},
): Promise<Renderer> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  let browser = await connectCdp(endpoint);
  let blocked = 0;

  // One context and page per panel size, reused between drawings (JavaScript off, every request
  // blocked). Drawings are serialized; a new context only if the size changes or one failed.
  let cached: { w: number; h: number; context: BrowserContext; page: Page } | undefined;
  const enqueue = priorityQueue();

  const dropCached = async (): Promise<void> => {
    const old = cached;
    cached = undefined;
    await old?.context.close().catch(() => undefined);
  };

  const pageFor = async (panel: Panel): Promise<Page> => {
    if (cached && (cached.w !== panel.w || cached.h !== panel.h || !browser.isConnected()))
      await dropCached();
    if (cached) return cached.page;
    const context = await browser.newContext({
      viewport: { width: panel.w, height: panel.h },
      deviceScaleFactor: 1,
      javaScriptEnabled: false,
    });
    try {
      await context.route("**/*", (route) => {
        blocked++;
        return route.abort();
      });
      const page = await context.newPage();
      cached = { w: panel.w, h: panel.h, context, page };
      return page;
    } catch (error) {
      await context.close().catch(() => undefined);
      throw error;
    }
  };

  const draw = async (html: string, panel: Panel): Promise<RenderOutput> => {
    try {
      const page = await pageFor(panel);
      await page.setContent(html, { waitUntil: "load", timeout: timeoutMs });
      // One call for both (each evaluation has a fixed cost): zone boxes and overflowing areas.
      const { boxes, overflow } = await page.$$eval("[data-zone],[data-fit]", (elements) => {
        const found: { key: string; x: number; y: number; w: number; h: number }[] = [];
        const over: string[] = [];
        for (const element of elements as unknown as ElementLike[]) {
          const zone = element.getAttribute("data-zone");
          if (zone !== null) {
            const r = element.getBoundingClientRect();
            found.push({
              key: zone,
              x: Math.round(r.x),
              y: Math.round(r.y),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
          const fit = element.getAttribute("data-fit");
          if (
            fit !== null &&
            (element.scrollHeight > element.clientHeight ||
              element.scrollWidth > element.clientWidth)
          ) {
            over.push(fit);
          }
        }
        return { boxes: found, overflow: over };
      });
      // The viewport is the panel, so the capture has exactly its size.
      const png = await page.screenshot({ type: "png", timeout: timeoutMs });
      const gray = decodePng(png, panel);
      return {
        raw1: toRaw1(gray, panel),
        gray: countGray(gray),
        boxes,
        overflow: [...new Set(overflow)],
      };
    } catch (error) {
      await dropCached();
      throw error;
    }
  };

  const withTimeout = async (html: string, panel: Panel): Promise<RenderOutput> => {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("render timed out"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([draw(html, panel), limit]);
    } catch (error) {
      await dropCached(); // a timed-out drawing may still hold the page
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    render(html, panel, options) {
      const run = async (): Promise<RenderOutput> => {
        try {
          if (!browser.isConnected()) {
            await dropCached();
            browser = await connectCdp(endpoint);
          }
          return await withTimeout(html, panel);
        } catch (error) {
          // A dropped connection is retried once with a fresh one.
          if (browser.isConnected()) throw error;
          await dropCached();
          browser = await connectCdp(endpoint);
          return withTimeout(html, panel);
        }
      };
      return enqueue(run, options?.priority);
    },
    blockedRequests: () => blocked,
    async close() {
      await enqueue(() => Promise.resolve(), "low"); // after everything already queued
      await dropCached();
      await browser.close().catch(() => undefined);
    },
  };
}

// ---- Recovery (F-011): wait for Docker, relaunch Chromium, never pull images ----

type LogFn = (line: Record<string, unknown>) => void;
const HOUR_MS = 3_600_000;
const BACKOFF_MAX_MS = 60_000;
const PROBE_TIMEOUT_MS = 10_000;

/** 1000, 2000, 4000 … 60000, 60000 … ms for the n-th failed attempt (0-based). */
const backoff = (attempt: number): number =>
  Math.min(1000 * 2 ** Math.min(attempt, 10), BACKOFF_MAX_MS);

/** Sleeps `ms`, or resolves early when the signal aborts. */
async function sleepUnless(
  sleepFn: (ms: number) => Promise<void>,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal === undefined) return sleepFn(ms);
  if (signal.aborted) return;
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<void>((resolve) => {
    onAbort = resolve;
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    await Promise.race([sleepFn(ms), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/** Waits (without end, or until `signal`) for the Docker daemon to answer. */
export async function waitForDocker(
  options: {
    log?: LogFn;
    clock?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    signal?: AbortSignal;
  } = {},
): Promise<void> {
  const clock = options.clock ?? ((): Date => new Date());
  const sleepFn = options.sleep ?? sleep;
  let firstFail: Date | undefined;
  let lastLog: Date | undefined;
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw new Error("aborted");
    try {
      await docker(["version", "--format", "{{.Server.Version}}"], PROBE_TIMEOUT_MS);
      if (firstFail !== undefined) {
        options.log?.({
          ts: clock().toISOString(),
          event: "docker",
          ok: true,
          waitedS: Math.round((clock().getTime() - firstFail.getTime()) / 1000),
        });
      }
      return;
    } catch {
      const now = clock();
      firstFail ??= now;
      if (lastLog === undefined || now.getTime() - lastLog.getTime() >= HOUR_MS) {
        lastLog = now;
        options.log?.({ ts: now.toISOString(), event: "docker", ok: false });
      }
    }
    await sleepUnless(sleepFn, backoff(attempt), options.signal);
  }
}

export interface ChromiumService {
  renderer: Renderer;
  /** The current address; undefined while Chromium is being relaunched. */
  endpoint(): string | undefined;
  /** Stops the container and stops relaunching. */
  stop(): Promise<void>;
}

export async function startChromiumService(
  options: {
    log?: LogFn;
    clock?: () => Date;
    sleep?: (ms: number) => Promise<void>;
    image?: string;
    /** Instance name: its orphan containers are removed before each start (F-010). */
    instance?: string;
  } = {},
): Promise<ChromiumService> {
  const clock = options.clock ?? ((): Date => new Date());
  const sleepFn = options.sleep ?? sleep;
  const image = options.image ?? chromiumImage();
  const { instance } = options;
  const stopper = new AbortController();
  const out: LogFn = (line) => options.log?.({ ts: clock().toISOString(), ...line });

  let container: { endpoint: string; name: string; stop(): Promise<void> } | undefined;
  let inner: Renderer | undefined;
  let blockedBefore = 0; // blocked requests of renderers already replaced
  // Changed from several async paths: one object keeps control-flow narrowing honest.
  const flags = { stopped: false, rendererClosed: false };
  let restarting: Promise<void> | undefined;

  // A start failure is logged the first time and then once per hour while the same code lasts.
  let failCode: string | undefined;
  let failLogged = clock();
  const startFailed = (code: string): void => {
    const now = clock();
    if (failCode === code && now.getTime() - failLogged.getTime() < HOUR_MS) return;
    failCode = code;
    failLogged = now;
    out({ event: "chromium", action: "start", ok: false, code });
  };

  /** Docker, then a container, then a renderer; repeats with growing waits until it works. */
  const bringUp = async (): Promise<void> => {
    await waitForDocker({
      ...(options.log ? { log: options.log } : {}),
      clock,
      sleep: sleepFn,
      signal: stopper.signal,
    });
    for (let attempt = 0; !flags.stopped; attempt++) {
      let code = "start";
      try {
        if (instance !== undefined) {
          await removeOrphanChromium(instance, options.log ? { log: options.log } : {});
        }
        try {
          await docker(["image", "inspect", "--format", "{{.Id}}", image], PROBE_TIMEOUT_MS);
        } catch {
          code = "image-missing";
          throw new Error("image missing");
        }
        const started = await runChromium(image, 0, instance);
        try {
          const renderer = await chromiumRenderer(started.endpoint);
          if (isStopped()) {
            await renderer.close().catch(() => undefined);
            await started.stop();
            return;
          }
          container = started;
          inner = renderer;
          failCode = undefined;
          return;
        } catch (error) {
          await started.stop();
          throw error;
        }
      } catch {
        startFailed(code);
      }
      await sleepUnless(sleepFn, backoff(attempt), stopper.signal);
    }
  };
  const isStopped = (): boolean => flags.stopped;

  /** Looks at the container; if it is gone, replaces it. One at a time. */
  const supervise = (): void => {
    if (restarting !== undefined || flags.stopped || flags.rendererClosed) return;
    const current = container;
    if (current === undefined) return;
    restarting = (async () => {
      let running: boolean;
      try {
        const answer = await docker(
          ["inspect", "-f", "{{.State.Running}}", current.name],
          PROBE_TIMEOUT_MS,
        );
        running = answer.trim() === "true";
      } catch {
        running = false;
      }
      if (running || isStopped()) return;
      const old = inner;
      container = undefined;
      inner = undefined;
      if (old !== undefined) {
        blockedBefore += old.blockedRequests();
        old.close().catch(() => undefined);
      }
      await docker(["rm", "-f", current.name]).catch(() => undefined);
      out({ event: "chromium", action: "restart" });
      await bringUp();
    })()
      .catch(() => undefined)
      .finally(() => {
        restarting = undefined;
      });
  };

  await bringUp();
  if (isStopped()) throw new Error("stopped");

  const renderer: Renderer = {
    async render(html, panel, renderOptions) {
      const current = inner;
      if (current === undefined) throw new Error("chromium is restarting");
      try {
        return await current.render(html, panel, renderOptions);
      } catch (error) {
        supervise();
        throw error;
      }
    },
    blockedRequests: () => blockedBefore + (inner?.blockedRequests() ?? 0),
    async close() {
      flags.rendererClosed = true;
      await inner?.close();
    },
  };

  return {
    renderer,
    endpoint: () => container?.endpoint,
    async stop() {
      flags.stopped = true;
      stopper.abort();
      await restarting;
      const current = container;
      container = undefined;
      await current?.stop();
    },
  };
}
