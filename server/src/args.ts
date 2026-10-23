// Command-line options of `npm run server` (F-003).
import { parseArgs } from "node:util";
import { LIMITS } from "../../contract/src/index.ts";
import type { ServerConfig } from "./app.ts";

export class UsageError extends Error {}

export interface Options {
  port: number;
  host: string;
  config: ServerConfig;
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
      },
    }));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : "invalid options", {
      cause: error,
    });
  }
  return {
    port: integer("--port", values.port ?? "8790", 0, 65_535),
    host: values.host ?? "127.0.0.1",
    config: {
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
    },
  };
}
