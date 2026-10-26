/* eslint-disable @typescript-eslint/no-unsafe-member-access -- registros de prueba */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  festivosManifest,
  guardedHttp13,
  icalManifest,
  startFakeIcal,
  type FakeIcal,
  type Loose,
} from "./helpers.ts";

let fake: FakeIcal;
beforeEach(async () => {
  fake = await startFakeIcal();
});
afterEach(async () => {
  await fake.close();
});

const TEXT = "BEGIN:VCALENDAR\r\nesto no es JSON {\r\nEND:VCALENDAR\r\n";

describe("CA9 requestText", () => {
  it("devuelve el cuerpo tal cual, también si no es JSON, con un GET", async () => {
    fake.routes.set("/cal/uno.ics", { status: 200, body: TEXT });
    const http = guardedHttp13(fake.base, undefined, icalManifest, { maxBytes: 65_536 });
    const r = await http.requestText("/cal/uno.ics");
    expect(r).toEqual({ status: 200, text: TEXT });
    expect(fake.requests).toEqual([{ method: "GET", path: "/cal/uno.ics" }]);
  });

  it("devuelve también un estado distinto de 200 con su texto", async () => {
    fake.routes.set("/cal/mal.ics", { status: 500, body: "roto" });
    const http = guardedHttp13(fake.base, undefined, icalManifest, { maxBytes: 65_536 });
    const r = await http.requestText("/cal/mal.ics");
    expect(r.status).toBe(500);
  });

  it("una ruta fuera del manifiesto → route, sin tocar la red", async () => {
    const http = guardedHttp13(fake.base, undefined, festivosManifest, { maxBytes: 65_536 });
    await expect(http.requestText("/otra/cosa.ics")).rejects.toMatchObject({ code: "route" });
    expect(fake.requests).toHaveLength(0);
  });

  it("no hay forma de elegir un método: recibe solo la ruta", () => {
    const http = guardedHttp13(fake.base, undefined, icalManifest, { maxBytes: 65_536 });
    expect(typeof http.requestText).toBe("function");
    expect(http.requestText.length).toBe(1);
  });

  it("respeta maxBytes (too-large) y no sigue redirecciones", async () => {
    fake.routes.set("/cal/grande.ics", { status: 200, body: "A".repeat(2000) });
    fake.routes.set("/cal/mueve.ics", {
      status: 302,
      body: "",
      headers: { Location: `${fake.base}/cal/uno.ics` },
    });
    fake.routes.set("/cal/uno.ics", { status: 200, body: TEXT });
    const http = guardedHttp13(fake.base, undefined, icalManifest, { maxBytes: 1000 });
    await expect(http.requestText("/cal/grande.ics")).rejects.toMatchObject({
      code: "too-large",
    });
    await expect(http.requestText("/cal/mueve.ics")).rejects.toBeInstanceOf(Error);
    expect(fake.requests.map((q) => q.path)).not.toContain("/cal/uno.ics");
  });

  it("el registro no lleva el contenido ni la ruta", async () => {
    fake.routes.set("/secreto-abc/cal.ics", { status: 200, body: TEXT });
    const logs: Loose[] = [];
    const http = guardedHttp13(fake.base, undefined, icalManifest, {
      maxBytes: 65_536,
      log: (l) => logs.push(l),
    });
    await http.requestText("/secreto-abc/cal.ics");
    expect(logs.length).toBeGreaterThan(0);
    const text = JSON.stringify(logs);
    expect(text).not.toContain("secreto-abc");
    expect(text).not.toContain("VCALENDAR");
  });

  it("request sigue igual: JSON por GET", async () => {
    fake.routes.set("/cal/datos", { status: 200, body: '{"a":1}' });
    const http = guardedHttp13(fake.base, undefined, icalManifest, { maxBytes: 65_536 });
    expect(await http.request("GET", "/cal/datos")).toEqual({ status: 200, json: { a: 1 } });
  });
});
