/* eslint-disable @typescript-eslint/unbound-method -- renders() is a closure, not a method */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateActionsResponse,
  validateErrorBody,
  validateIndex,
  validateZones,
  formatPanelHeader,
  type Panel,
} from "../../contract/src/index.ts";
import { createApp } from "./index.ts";

const PANEL: Panel = { w: 800, h: 480, dpi: 124, depth: 1 };
const config = { nextWakeS: 1800, headersTimeoutMs: 10_000 };

function headers(panel: Panel = PANEL, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Tintero-Protocol": "1",
    "Tintero-Firmware": "test-1",
    "Tintero-Power": "usb",
    "Tintero-Formats": "raw1",
    "Tintero-Panel": formatPanelHeader(panel),
    ...extra,
  };
}

let lines: string[];
beforeEach(() => {
  lines = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

async function index(app: ReturnType<typeof createApp>["app"], panel: Panel = PANEL) {
  const res = await app.inject({ method: "GET", url: "/api/v1/index", headers: headers(panel) });
  const parsed = validateIndex(res.body);
  if (!parsed.ok) throw new Error("index invalid");
  return parsed.value;
}

function post(app: ReturnType<typeof createApp>["app"], url: string, payload: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { ...headers(), "content-type": "application/json" },
    payload,
  });
}

const action = (id: string, zone: string, act: string, view = "demo") =>
  JSON.stringify({ actions: [{ id, view, zone, act, at: 1 }] });

describe("next_wake_s by power (ADR-0057)", () => {
  const wake = async (cfg: Parameters<typeof createApp>[0], power: string) => {
    const { app } = createApp(cfg);
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/index",
      headers: headers(PANEL, { "Tintero-Power": power }),
    });
    await app.close();
    return (JSON.parse(res.body) as { next_wake_s: number }).next_wake_s;
  };
  it("uses nextWakeUsbS only with usb", async () => {
    const cfg = { nextWakeS: 1800, nextWakeUsbS: 600, headersTimeoutMs: 10_000 };
    expect(await wake(cfg, "battery")).toBe(1800);
    expect(await wake(cfg, "usb")).toBe(600);
  });
  it("falls back to nextWakeS without nextWakeUsbS", async () => {
    expect(await wake(config, "usb")).toBe(1800);
  });
});

describe("index", () => {
  it("is valid and lists demo, detalle, patron (CA2)", async () => {
    const { app } = createApp(config);
    const body = await index(app);
    expect(body.views.map((v) => v.id)).toEqual(["demo", "detalle", "patron"]);
    expect(body.current).toBe("demo");
    expect(body.views[1]?.parent).toBe("demo");
    expect(body.panel).toEqual(PANEL);
    expect(body.views.every((v) => v.bytes === 48_000 && v.format === "raw1")).toBe(true);
    expect(body.next_wake_s).toBe(1800);
    await app.close();
  });

  it("rejects bad headers with 400 invalid_request (CA9)", async () => {
    const { app } = createApp(config);
    const noPower = headers();
    delete noPower["Tintero-Power"];
    const bad = [
      noPower,
      headers(PANEL, { "Tintero-Formats": "png1" }),
      headers(PANEL, { "Tintero-Firmware": "x".repeat(65) }),
    ];
    for (const h of bad) {
      const res = await app.inject({ method: "GET", url: "/api/v1/index", headers: h });
      expect(res.statusCode).toBe(400);
      const parsed = validateErrorBody(res.body);
      expect(parsed.ok && parsed.value.error.code).toBe("invalid_request");
    }
    await app.close();
  });

  it("works for another panel (CA7)", async () => {
    const { app } = createApp(config);
    const panel = { w: 648, h: 480, dpi: 124, depth: 1 } as const;
    const body = await index(app, panel);
    expect(body.views[0]?.bytes).toBe(38_880);
    for (const view of body.views) {
      const res = await app.inject({
        method: "GET",
        url: `/api/v1/views/${view.id}/zones?h=${view.hash}`,
        headers: headers(panel),
      });
      expect(validateZones(res.body, panel).ok).toBe(true);
    }
    await app.close();
  });
});

describe("images and cache", () => {
  it("serves images, 304, 409 and 404 (CA8)", async () => {
    const { app, renders } = createApp(config);
    const body = await index(app);
    const demo = body.views[0];
    const url = `/api/v1/views/demo/image?h=${demo?.hash ?? ""}`;
    const ok = await app.inject({ method: "GET", url, headers: headers() });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["content-type"]).toBe("application/octet-stream");
    expect(ok.headers["content-length"]).toBe("48000");
    expect(ok.headers.etag).toBe(`"${demo?.hash ?? ""}"`);
    const cached = await app.inject({
      method: "GET",
      url,
      headers: headers(PANEL, { "If-None-Match": `"${demo?.hash ?? ""}"` }),
    });
    expect(cached.statusCode).toBe(304);

    const stale = await app.inject({
      method: "GET",
      url: "/api/v1/views/demo/image?h=0123456789abcdef",
      headers: headers(),
    });
    expect(stale.statusCode).toBe(409);
    expect(validateErrorBody(stale.body).ok).toBe(true);
    const unknown = await app.inject({
      method: "GET",
      url: "/api/v1/views/nada/zones?h=0123456789abcdef",
      headers: headers(),
    });
    expect(unknown.statusCode).toBe(404);
    const parsed = validateErrorBody(unknown.body);
    expect(parsed.ok && parsed.value.error.code).toBe("unknown_view");
    const noHash = await app.inject({
      method: "GET",
      url: "/api/v1/views/demo/image",
      headers: headers(),
    });
    expect(noHash.statusCode).toBe(400);
    expect(renders()).toBeLessThanOrEqual(3);
    await app.close();
  });

  it("draws each view at most once (CA16)", async () => {
    const { app, renders } = createApp(config);
    const body = await index(app);
    const before = renders();
    expect(before).toBeLessThanOrEqual(3);
    const patron = body.views[2];
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: "GET",
        url: `/api/v1/views/patron/image?h=${patron?.hash ?? ""}`,
        headers: headers(),
      });
    }
    await index(app);
    expect(renders()).toBe(before);
    await app.close();
  });
});

describe("actions", () => {
  it("toggles, is idempotent, opens detalle, and marks stale (CA5, CA6)", async () => {
    const { app } = createApp(config);
    const first = await index(app);
    const res = await post(app, "/api/v1/actions", action("act-00000001", "c2", "toggle"));
    const parsed = validateActionsResponse(res.body);
    expect(parsed.ok && parsed.value).toEqual({
      results: [{ id: "act-00000001", status: "applied" }],
      index_changed: true,
    });
    const second = await index(app);
    expect(second.views[0]?.hash).not.toBe(first.views[0]?.hash);

    const again = await post(app, "/api/v1/actions", action("act-00000001", "c2", "toggle"));
    const dup = validateActionsResponse(again.body);
    expect(dup.ok && dup.value.results[0]?.status).toBe("duplicate");
    expect(dup.ok && dup.value.index_changed).toBe(false);
    expect((await index(app)).views[0]?.hash).toBe(second.views[0]?.hash);

    const stale = await post(app, "/api/v1/actions", action("act-00000002", "zzz", "toggle"));
    const staleParsed = validateActionsResponse(stale.body);
    expect(staleParsed.ok && staleParsed.value.results[0]?.status).toBe("stale");
    expect(staleParsed.ok && staleParsed.value.index_changed).toBe(false);

    await post(app, "/api/v1/actions", action("act-00000003", "abrir", "open"));
    expect((await index(app)).current).toBe("detalle");
    await app.close();
  });

  it("remembers only the last 1000 ids", async () => {
    const { app } = createApp(config);
    for (let i = 0; i < 1001; i++) {
      await post(app, "/api/v1/actions", action(`act-${String(i).padStart(8, "0")}`, "x", "open"));
    }
    const old = await post(app, "/api/v1/actions", action("act-00000000", "x", "open"));
    const parsed = validateActionsResponse(old.body);
    expect(parsed.ok && parsed.value.results[0]?.status).toBe("stale");
    const recent = await post(app, "/api/v1/actions", action("act-00001000", "x", "open"));
    const parsedRecent = validateActionsResponse(recent.body);
    expect(parsedRecent.ok && parsedRecent.value.results[0]?.status).toBe("duplicate");
    await app.close();
  });
});

describe("limits", () => {
  it("answers 413 too_large for 5000 bytes that are not JSON (CA10)", async () => {
    const { app } = createApp(config);
    const res = await post(app, "/api/v1/actions", "x".repeat(5000));
    expect(res.statusCode).toBe(413);
    const parsed = validateErrorBody(res.body);
    expect(parsed.ok && parsed.value.error.code).toBe("too_large");
    await app.close();
  });
});

describe("log route and not found", () => {
  it("writes device_log lines without control characters (CA11)", async () => {
    const { app } = createApp(config);
    const body = JSON.stringify({ entries: [{ at: 1, level: "warn", msg: "bad\u0007 news" }] });
    const res = await post(app, "/api/v1/log", body);
    expect(res.statusCode).toBe(204);
    const device = lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .find((l) => l.device_log);
    expect(device?.device_log).toEqual({ level: "warn", msg: "bad news" });
    expect((await post(app, "/api/v1/log", "{}")).statusCode).toBe(400);
    await app.close();
  });

  it("answers 404 without body to other routes and methods (CA12)", async () => {
    const { app } = createApp(config);
    for (const [method, url] of [
      ["GET", "/"],
      ["GET", "/api/v1/otra"],
      ["DELETE", "/api/v1/index"],
      ["HEAD", "/api/v1/index"],
    ] as const) {
      const res = await app.inject({ method, url, headers: headers() });
      expect(res.statusCode).toBe(404);
      expect(res.body).toBe("");
    }
    await app.close();
  });
});

describe("request log", () => {
  it("writes one line per request with exactly the fields and nothing else (CA14)", async () => {
    const { app } = createApp(config);
    await app.inject({
      method: "GET",
      url: "/api/v1/index?secret=1",
      headers: headers(PANEL, { Authorization: "Bearer SECRETTOKEN", Cookie: "c=SECRETCOOKIE" }),
    });
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(Object.keys(line).sort()).toEqual(
      ["bytes", "firmware", "method", "ms", "power", "route", "status", "ts"].sort(),
    );
    expect(line).toMatchObject({
      method: "GET",
      route: "/api/v1/index",
      status: 200,
      firmware: "test-1",
      power: "usb",
    });
    expect(lines.join("")).not.toMatch(/SECRET|Bearer|w=800/);
    await app.close();
  });
});
