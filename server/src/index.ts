// Public entry of the server (F-003): app for in-process tests, listener and demonstration views.
import type { AddressInfo } from "node:net";
import { createApp, type ServerConfig } from "./app.ts";

export { createApp, demoViews } from "./app.ts";
export type { ServerConfig } from "./app.ts";
export type { DemoView } from "./views.ts";

/** Listens on 127.0.0.1 only (D3: no authentication until F-004). */
export async function startServer(
  config: ServerConfig,
  port: number,
): Promise<{ url: string; close(): Promise<void> }> {
  const { app } = createApp(config);
  await app.listen({ host: "127.0.0.1", port });
  const address = app.server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => app.close(),
  };
}
