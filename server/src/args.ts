// Command-line options of `npm run server` (F-003).
import { parseArgs } from "node:util";
import { LIMITS } from "../../contract/src/index.ts";
import type { ServerConfig } from "./app.ts";
import { cdpBase } from "./engine/chromium.ts";

export class UsageError extends Error {}

export interface Options {
  port: number;
  host: string;
  config: ServerConfig;
  /** Files of the view engine (F-005); they come together. */
  views?: string;
  data?: string;
  /** An already running Chromium (`http://127.0.0.1:<port>`); otherwise the server starts its own. */
  chromium?: string;
  /** Integrations file (F-009); needs `views` and `data`. */
  integrations?: string;
}

function integer(name: string, value: string, min: number, max: number): number {
  if (!/^\d{1,9}$/.test(value)) throw new UsageError(`${name} must be a non-negative integer`);
  const number = Number(value);
  if (number < min || number > max) throw new UsageError(`${name} must be from ${min} to ${max}`);
  return number;
}

export function parseOptions(argv: string[]): Options {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        port: { type: "string" },
        host: { type: "string" },
        "next-wake-s": { type: "string" },
        "headers-timeout-ms": { type: "string" },
        "tls-cert": { type: "string" },
        "tls-key": { type: "string" },
        "client-ca": { type: "string" },
        devices: { type: "string" },
        "max-panels": { type: "string" },
        "max-connections": { type: "string" },
        views: { type: "string" },
        data: { type: "string" },
        chromium: { type: "string" },
        integrations: { type: "string" },
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "invalid options", {
      cause: error,
    });
  }
  const config: ServerConfig = {
    nextWakeS: integer(
      "--next-wake-s",
      values["next-wake-s"] ?? "1800",
      LIMITS.minWakeS,
      LIMITS.maxWakeS,
    ),
    headersTimeoutMs: integer(
      "--headers-timeout-ms",
      values["headers-timeout-ms"] ?? "10000",
      50,
      60_000,
    ),
  };
  if (values["max-panels"] !== undefined) {
    config.maxPanelsPerDevice = integer("--max-panels", values["max-panels"], 1, 64);
  }
  if (values["max-connections"] !== undefined) {
    config.maxConnections = integer("--max-connections", values["max-connections"], 1, 10_000);
  }
  const { "tls-cert": certFile, "tls-key": keyFile, "client-ca": clientCaFile } = values;
  const devicesFile = values.devices;
  const given = [certFile, keyFile, clientCaFile, devicesFile].filter((v) => v !== undefined);
  if (given.length > 0 && given.length < 4) {
    throw new UsageError("--tls-cert, --tls-key, --client-ca and --devices go together");
  }
  if (
    certFile !== undefined &&
    keyFile !== undefined &&
    clientCaFile !== undefined &&
    devicesFile !== undefined
  ) {
    config.tls = { certFile, keyFile, clientCaFile, devicesFile };
  }
  const { views, data, chromium, integrations } = values;
  if ((views === undefined) !== (data === undefined)) {
    throw new UsageError("--views and --data go together");
  }
  if (integrations !== undefined && views === undefined) {
    throw new UsageError("--integrations needs --views and --data");
  }
  if (chromium !== undefined) {
    if (views === undefined) throw new UsageError("--chromium needs --views and --data");
    try {
      cdpBase(chromium);
    } catch (error) {
      throw new UsageError("--chromium must be http://127.0.0.1:<port>", { cause: error });
    }
  }
  return {
    port: integer("--port", values.port ?? "8790", 0, 65_535),
    host: values.host ?? "127.0.0.1",
    config,
    ...(views !== undefined && data !== undefined ? { views, data } : {}),
    ...(chromium === undefined ? {} : { chromium: cdpBase(chromium) }),
    ...(integrations === undefined ? {} : { integrations }),
  };
}
