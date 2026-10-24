// Chromium in Docker and the CDP connection (sensitive zone, ADR-0031, docs/seguridad.md).
// CDP goes over plain HTTP to 127.0.0.1 only: `cdpBase` is the single place that builds and
// validates that URL, and the two calls that use it are the only ones marked `nosemgrep`.
import { execFile } from "node:child_process";
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
export interface Renderer {
  render(html: string, panel: Panel): Promise<RenderOutput>;
  /** Requests the page tried to make and that were blocked, since the renderer was created. */
  blockedRequests(): number;
  close(): Promise<void>;
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
): string[] {
  return [
    "run",
    "--rm",
    "-d",
    "--name",
    name,
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
    void response.body?.cancel();
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
  options: { port?: number } = {},
): Promise<{ endpoint: string; name: string; stop(): Promise<void> }> {
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("invalid port");
  const name = `tintero-chromium-${randomBytes(4).toString("hex")}`;
  if (!CONTAINER_NAME.test(name)) throw new Error("invalid container name");
  const fontsDir = fileURLToPath(new URL("../../fonts", import.meta.url));
  await docker(chromiumDockerArgs(name, port, fontsDir, chromiumImage()), START_TIMEOUT_MS);
  const stop = async (): Promise<void> => {
    try {
      await docker(["stop", "--time", "2", name], 20_000);
    } catch {
      // already gone (--rm removes it when it stops)
    }
  };
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
  let tail: Promise<unknown> = Promise.resolve();

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
    render(html, panel) {
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
      const result = tail.then(run, run);
      tail = result.catch(() => undefined);
      return result;
    },
    blockedRequests: () => blocked,
    async close() {
      await tail;
      await dropCached();
      await browser.close().catch(() => undefined);
    },
  };
}
