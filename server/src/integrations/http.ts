// The guarded HTTP client of the integrations (F-009, ADR-0042, ADR-0043). Sensitive zone: the only
// production file with `fetch` towards an integration. It holds the key (I1), limits origin, methods
// and paths (I2, I4), caps time and size, and logs without content (I7, S6).
import { fstatSync, openSync, closeSync } from "node:fs";
import { readCapped } from "../tls.ts";
import type { Manifest } from "./manifest.ts";

export type HttpErrorCode =
  | "host"
  | "route"
  | "write-denied"
  | "bad-path"
  | "key-missing"
  | "key-permissions"
  | "key-too-large"
  | "key-empty"
  | "timeout"
  | "too-large"
  | "network"
  | "status"
  | "bad-json";

export class IntegrationHttpError extends Error {
  readonly code: HttpErrorCode;
  readonly httpStatus?: number;
  constructor(code: HttpErrorCode, httpStatus?: number) {
    super(code);
    this.code = code;
    if (httpStatus !== undefined) this.httpStatus = httpStatus;
  }
}

export interface GuardedHttp {
  request(
    method: "GET" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }>;
}

export interface GuardedHttpOptions {
  maxBytes?: number;
  timeoutMs?: number;
  allowWrite?: boolean;
  log?: (line: Record<string, unknown>) => void;
  clock?: () => Date;
}

const MAX_KEY_BYTES = 4096;
const DEFAULT_MAX_BYTES = 1_048_576;
const DEFAULT_TIMEOUT_MS = 5000;

/** D11: `https://…`, or `http://127.0.0.1:<port>/…` for the owner's own local service. */
export function parseBase(text: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new IntegrationHttpError("host");
  }
  const plainLoopback = url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port !== "";
  if (url.protocol !== "https:" && !plainLoopback) throw new IntegrationHttpError("host");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new IntegrationHttpError("host");
  }
  return url;
}

function readKey(keyFile: string): string {
  let size: number;
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path from the owner's configuration
    const fd = openSync(keyFile, "r");
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile()) throw new IntegrationHttpError("key-missing");
      if ((stat.mode & 0o077) !== 0) throw new IntegrationHttpError("key-permissions");
      size = stat.size;
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if (error instanceof IntegrationHttpError) throw error;
    throw new IntegrationHttpError("key-missing");
  }
  if (size > MAX_KEY_BYTES) throw new IntegrationHttpError("key-too-large");
  let token: string;
  try {
    token = readCapped(keyFile, MAX_KEY_BYTES).toString("utf8").trim();
  } catch (error) {
    const big = error instanceof Error && error.message === "file too large";
    throw new IntegrationHttpError(big ? "key-too-large" : "key-missing");
  }
  if (token.length === 0) throw new IntegrationHttpError("key-empty");
  return token;
}

// eslint-disable-next-line no-control-regex -- control characters are the point
const BAD_PATH = /(^\/\/)|(\.\.)|[\\#\s\u0000-\u001f\u007f]|(:\/\/)|(%2e)|(%2f)|(%5c)/i;

function checkPath(path: string): void {
  if (!path.startsWith("/") || BAD_PATH.test(path)) throw new IntegrationHttpError("bad-path");
}

export function guardedHttp(
  base: URL,
  keyFile: string,
  manifest: Manifest,
  options: GuardedHttpOptions = {},
): GuardedHttp {
  const checked = parseBase(base.href);
  if (manifest.hosts !== "configured" && !manifest.hosts.includes(checked.host)) {
    throw new IntegrationHttpError("host");
  }
  const token = readKey(keyFile);
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const log = options.log ?? ((): void => undefined);
  const clock = options.clock ?? ((): Date => new Date());
  const basePath = checked.pathname.replace(/\/+$/, "");

  async function readBody(response: Response): Promise<string> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      void response.body?.cancel();
      throw new IntegrationHttpError("too-large");
    }
    if (!response.body) return "";
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel();
        throw new IntegrationHttpError("too-large");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  return {
    async request(method, path, body) {
      checkPath(path);
      const allowed = manifest.routes.some(
        (route) => route.method === method && path.startsWith(route.prefix),
      );
      if (!allowed) throw new IntegrationHttpError("route");
      if (method === "PATCH" && !(manifest.writes && options.allowWrite === true)) {
        throw new IntegrationHttpError("write-denied");
      }
      const url = new URL(`${checked.origin}${basePath}${path}`);
      if (url.origin !== checked.origin) throw new IntegrationHttpError("bad-path");

      const started = performance.now();
      let status = 0;
      const controller = new AbortController();
      const state = { timedOut: false };
      const timer = setTimeout(() => {
        state.timedOut = true;
        controller.abort();
      }, timeoutMs);
      try {
        const headers: Record<string, string> = { Authorization: token };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        let response: Response;
        try {
          // nosemgrep: react-insecure-request -- integración local (docs/seguridad.md)
          response = await fetch(url, {
            method,
            headers,
            redirect: "error",
            signal: controller.signal,
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
        } catch {
          throw new IntegrationHttpError(state.timedOut ? "timeout" : "network");
        }
        status = response.status;
        if (status < 200 || status > 299) {
          void response.body?.cancel();
          throw new IntegrationHttpError("status", status);
        }
        let text: string;
        try {
          text = await readBody(response);
        } catch (error) {
          if (error instanceof IntegrationHttpError) throw error;
          throw new IntegrationHttpError(state.timedOut ? "timeout" : "network");
        }
        if (text.trim() === "") return { status, json: null };
        try {
          return { status, json: JSON.parse(text) as unknown };
        } catch {
          throw new IntegrationHttpError("bad-json");
        }
      } finally {
        clearTimeout(timer);
        log({
          ts: clock().toISOString(),
          integration: manifest.id,
          host: checked.host,
          method,
          status,
          ms: Math.round(performance.now() - started),
        });
      }
    },
  };
}
