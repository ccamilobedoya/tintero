// HTTP client of the emulator (R2): one request at a time, one keep-alive socket, capped reads.
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import { formatPanelHeader, PROTOCOL_VERSION } from "../../contract/src/index.ts";
import type { EmulatorConfig, RequestRecord } from "./types.ts";

/** Failure of a request: the network failed, or the body went over its cap. */
export class HttpFailure extends Error {
  readonly code: "network" | "too_large";
  constructor(code: "network" | "too_large") {
    super(code);
    this.code = code;
  }
}

export interface HttpResult {
  status: number;
  body: Buffer;
}

function deviceHeaders(config: EmulatorConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Tintero-Protocol": String(PROTOCOL_VERSION),
    "Tintero-Firmware": config.firmware,
    "Tintero-Power": config.power,
    "Tintero-Formats": config.formats.join(","),
    "Tintero-Panel": formatPanelHeader(config.panel),
  };
  if (config.batteryMv !== undefined) headers["Tintero-Battery-mV"] = String(config.batteryMv);
  if (config.rssi !== undefined) headers["Tintero-RSSI"] = String(config.rssi);
  return headers;
}

export class HttpClient {
  readonly records: RequestRecord[] = [];
  private readonly sockets = new Set<Socket>();
  private readonly config: EmulatorConfig;
  private readonly base: URL;
  private readonly agent: http.Agent;
  private readonly secure: boolean;

  constructor(config: EmulatorConfig) {
    const files = config.tls;
    /* eslint-disable security/detect-non-literal-fs-filename -- paths come from the command line of the owner */
    // `ca` replaces the public roots: only the CA of Tintero is trusted.
    const tls: https.AgentOptions | undefined = files && {
      ca: readFileSync(files.caFile),
      cert: readFileSync(files.certFile),
      key: readFileSync(files.keyFile),
    };
    /* eslint-enable security/detect-non-literal-fs-filename */
    this.config = config;
    this.base = new URL(config.server);
    if (this.base.protocol !== "http:" && this.base.protocol !== "https:") {
      throw new Error("server must be an http or https URL");
    }
    this.secure = this.base.protocol === "https:";
    const options = { keepAlive: true, maxSockets: 1, maxFreeSockets: 1 };
    this.agent = this.secure ? new https.Agent({ ...tls, ...options }) : new http.Agent(options);
  }

  get connections(): number {
    return this.sockets.size;
  }

  close(): void {
    this.agent.destroy();
  }

  /** Requests whose record index is >= `from` (to report one operation). */
  since(from: number): RequestRecord[] {
    return this.records.slice(from);
  }

  get(path: string, maxBytes: number): Promise<HttpResult> {
    return this.request("GET", path, undefined, maxBytes);
  }

  post(path: string, body: unknown, maxBytes: number): Promise<HttpResult> {
    return this.request("POST", path, JSON.stringify(body), maxBytes);
  }

  private request(
    method: "GET" | "POST",
    path: string,
    payload: string | undefined,
    maxBytes: number,
  ): Promise<HttpResult> {
    const record: RequestRecord = { method, path, status: "error", bytes: 0 };
    this.records.push(record);
    const headers = deviceHeaders(this.config);
    if (payload !== undefined) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = String(Buffer.byteLength(payload));
    }
    return new Promise<HttpResult>((resolve, reject) => {
      let settled = false;
      const done = (error: HttpFailure | undefined, result?: HttpResult): void => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else if (result) resolve(result);
      };
      const options: http.RequestOptions = {
        method,
        hostname: this.base.hostname.replace(/^\[|\]$/g, ""),
        port: this.base.port,
        path,
        headers,
        agent: this.agent,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      };
      const req = (this.secure ? https : http).request(options, (res) => {
        record.status = res.statusCode ?? 0;
        const length = Number(res.headers["content-length"]);
        if (Number.isFinite(length) && length > maxBytes) {
          res.destroy();
          done(new HttpFailure("too_large"));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          record.bytes = total;
          if (total > maxBytes) {
            // Stop reading: nothing over the cap is ever kept or parsed.
            res.destroy();
            done(new HttpFailure("too_large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          done(undefined, { status: res.statusCode ?? 0, body: Buffer.concat(chunks) });
        });
        res.on("error", () => {
          done(new HttpFailure("network"));
        });
        res.on("close", () => {
          if (!res.complete) done(new HttpFailure("network"));
        });
      });
      req.on("socket", (socket) => {
        this.sockets.add(socket);
      });
      req.on("error", () => {
        done(new HttpFailure("network"));
      });
      req.end(payload);
    });
  }
}
