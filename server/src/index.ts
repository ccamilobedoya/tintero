// Public entry of the server (F-003, F-004): app for in-process tests, listener and demonstration views.
import type { AddressInfo } from "node:net";
import { createApp, type ServerConfig } from "./app.ts";

export { createApp, demoViews } from "./app.ts";
export type { ServerConfig } from "./app.ts";
export { createEngine, zoneId } from "./engine/index.ts";
export type { Engine, EngineOptions, RenderedView, Renderer } from "./engine/index.ts";
export { fingerprint } from "./tls.ts";
export type { TlsConfig } from "./tls.ts";
export type { DemoView } from "./views.ts";

/** Listens on 127.0.0.1 only, with or without TLS (Funnel `--tcp` forwards to it). */
export async function startServer(
  config: ServerConfig,
  port: number,
): Promise<{ url: string; close(): Promise<void> }> {
  const { app } = createApp(config);
  await app.listen({ host: "127.0.0.1", port });
  const address = app.server.address() as AddressInfo;
  const scheme = config.tls ? "https" : "http";
  return {
    url: `${scheme}://127.0.0.1:${address.port}`,
    close: () => app.close(),
  };
}
