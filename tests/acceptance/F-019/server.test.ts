/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, security/detect-object-injection -- JSON de respuesta de prueba */
// CA13 (servidor con pb1) y CA19 (topes del servidor), con el servidor en proceso sobre 127.0.0.1.
import { afterEach, describe, expect, it } from "vitest";
import { crc32Hex, validateIndex, formatPanelHeader } from "../../../contract/src/index.ts";
import { unpackBits } from "../../../contract/src/packbits.ts";
import { startServer } from "../../../server/src/index.ts";
import type { Engine, RenderedView } from "../../../server/src/index.ts";
import { API, P124, RAW_BYTES, captureStdout, engineWith, getLocal, sameBytes } from "./helpers.ts";

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

async function serve(engine: Engine): Promise<string> {
  const server = await startServer({ nextWakeS: 1800, headersTimeoutMs: 5000, engine }, 0);
  closers.push(async () => {
    await server.close();
    await engine.idle();
    await engine.close();
  });
  return server.url;
}

const headers = (formats: string): Record<string, string> => ({
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "test-0.2.0",
  "Tintero-Power": "usb",
  "Tintero-Formats": formats,
  "Tintero-Panel": formatPanelHeader(P124),
});

interface Entry {
  id: string;
  hash: string;
  format: string;
  bytes: number;
  crc32: string;
  parent?: string;
}
interface Idx {
  status: number;
  text: string;
  current: string;
  views: Entry[];
}

async function indexFor(url: string, formats: string): Promise<Idx> {
  const r = await getLocal(url, `${API}/index`, { headers: headers(formats) });
  const body = (r.status === 200 ? JSON.parse(r.text) : { current: "", views: [] }) as {
    current: string;
    views: Entry[];
  };
  return { status: r.status, text: r.text, current: body.current, views: body.views };
}

function firstOf(idx: Idx): Entry {
  const entry = idx.views[0];
  if (entry === undefined) throw new Error("the index has no views");
  return entry;
}

async function imageFor(url: string, entry: Entry, formats: string) {
  return getLocal(url, `${API}/views/${entry.id}/image?h=${entry.hash}`, {
    headers: headers(formats),
  });
}

describe("CA13 servidor: pb1 en el índice y en la imagen", () => {
  it("con pb1,raw1 cada vista va en pb1, con bytes del cuerpo y crc32 del raw1 decodificado", async () => {
    const engine = engineWith("text", ["hoy", "pendientes", "agenda"]);
    const url = await serve(engine);
    const idx = await indexFor(url, "pb1,raw1");
    expect(idx.status).toBe(200);
    expect(idx.views.map((v) => v.id).sort()).toEqual(["agenda", "hoy", "pendientes"]);
    for (const v of idx.views) {
      expect(v.format, v.id).toBe("pb1");
      const img = await imageFor(url, v, "pb1,raw1");
      expect(img.status, v.id).toBe(200);
      expect(v.bytes, v.id).toBe(img.buf.length);
      expect(img.buf.length, v.id).toBeLessThan(RAW_BYTES);
      const raw = unpackBits(new Uint8Array(img.buf), RAW_BYTES);
      expect(v.crc32, v.id).toBe(crc32Hex(raw));
    }
    expect(validateIndex(idx.text).ok).toBe(true);
  });

  it("con raw1 el índice y las imágenes son byte a byte los de antes (mismos datos y hora)", async () => {
    const engine = engineWith("text", ["hoy", "pendientes", "agenda"]);
    const url = await serve(engine);
    const drawn = await engine.index("local", P124);
    if (!drawn.ok) throw new Error("engine failed");

    const idx = await indexFor(url, "raw1");
    expect(idx.status).toBe(200);
    expect(idx.current).toBe(drawn.value.current);
    expect(idx.views.map((v) => ({ ...v, parent: v.parent ?? null }))).toEqual(
      drawn.value.views.map((v) => ({
        id: v.id,
        hash: v.hash,
        format: "raw1",
        bytes: RAW_BYTES,
        crc32: v.crc32,
        parent: v.parent ?? null,
      })),
    );
    for (const v of idx.views) {
      const img = await imageFor(url, v, "raw1");
      const expected = drawn.value.views.find((x) => x.id === v.id)?.raw1;
      expect(expected).toBeDefined();
      expect(sameBytes(new Uint8Array(img.buf), expected ?? new Uint8Array(0)), v.id).toBe(true);
    }
    // sin la cabecera de pb1 tampoco se manda pb1 (lista con otro orden y espacios)
    const again = await indexFor(url, "raw1 , png1");
    expect(again.status).toBe(200);
    expect(again.views.every((v) => v.format !== "pb1")).toBe(true);
  });

  it("hash y ETag no cambian entre raw1 y pb1", async () => {
    const engine = engineWith("text", ["hoy", "pendientes", "agenda"]);
    const url = await serve(engine);
    const a = await indexFor(url, "raw1");
    const b = await indexFor(url, "pb1,raw1");
    expect(b.views.map((v) => [v.id, v.hash])).toEqual(a.views.map((v) => [v.id, v.hash]));
    const ra = await imageFor(url, firstOf(a), "raw1");
    const rb = await imageFor(url, firstOf(b), "pb1,raw1");
    expect(ra.headers.get("etag")).not.toBeNull();
    expect(rb.headers.get("etag")).toBe(ra.headers.get("etag"));
  });

  it("una imagen de ruido que no se achica va en raw1 aunque el aparato acepte pb1", async () => {
    const engine = engineWith("noise", ["hoy"]);
    const url = await serve(engine);
    const idx = await indexFor(url, "pb1,raw1");
    expect(idx.status).toBe(200);
    const only = firstOf(idx);
    expect(only.format).toBe("raw1");
    expect(only.bytes).toBe(RAW_BYTES);
    const img = await imageFor(url, only, "pb1,raw1");
    expect(img.buf.length).toBe(RAW_BYTES);
    expect(only.crc32).toBe(crc32Hex(new Uint8Array(img.buf)));
  });

  it("Tintero-Formats: los nombres que no conoce se ignoran si queda uno conocido; bmp solo sigue siendo 400", async () => {
    const engine = engineWith("text", ["hoy"]);
    const url = await serve(engine);
    expect((await getLocal(url, `${API}/index`, { headers: headers("bmp,raw1") })).status).toBe(
      200,
    );
    expect((await getLocal(url, `${API}/index`, { headers: headers("future,pb1") })).status).toBe(
      200,
    );
    expect((await getLocal(url, `${API}/index`, { headers: headers("pb1") })).status).toBe(200);
    expect((await getLocal(url, `${API}/index`, { headers: headers("bmp") })).status).toBe(400);
    expect((await getLocal(url, `${API}/index`, { headers: headers("bmp,future") })).status).toBe(
      400,
    );
  });
});

// --- CA19 -----------------------------------------------------------------------------------------

const idOf = (i: number): string => `v${String(i).padStart(15, "0")}`;

function fakeView(i: number, parent: string | undefined): RenderedView {
  const raw1 = new Uint8Array(RAW_BYTES);
  raw1[i] = 0xff;
  const view: RenderedView = {
    id: idOf(i),
    raw1,
    zones: [],
    hash: `41d0e2aa${String(i).padStart(8, "0")}`,
    crc32: crc32Hex(raw1),
    hidden: {},
    overflow: [],
    tooSmall: [],
    bandInk: [],
    focus: { ring: 3, pad: 6, dash: 8 },
  };
  if (parent !== undefined) view.parent = parent;
  return view;
}

/** A hand-made engine: its index is exactly the list of views it is given. */
function fakeEngine(views: RenderedView[], current: string): Engine {
  const unsupported = (): never => {
    throw new Error("not used by this test");
  };
  return {
    index: () => Promise.resolve({ ok: true, value: { current, views, fullRefresh: false } }),
    view: (_device, _panel, id, hash) => {
      const v = views.find((x) => x.id === id && x.hash === hash);
      return v ? { ok: true, value: v } : { ok: false, status: 404, code: "unknown_view" };
    },
    apply: unsupported,
    setSource: unsupported,
    setHolidays: unsupported,
    prewarm: () => Promise.resolve(),
    idle: () => Promise.resolve(),
    renders: () => 0,
    close: () => Promise.resolve(),
  };
}

describe("CA19 el índice del servidor respeta el tope de 2 048 bytes", () => {
  const sixteen = (): RenderedView[] =>
    Array.from({ length: 16 }, (_, i) => fakeView(i, i === 0 ? undefined : idOf(i - 1)));

  it("16 vistas con ids de 16 caracteres y padres: ≤ 2 048 bytes, current está, hay aviso y valida", async () => {
    const views = sixteen();
    const url = await serve(fakeEngine(views, idOf(1)));
    const { value: first, lines } = await captureStdout(async () => {
      const a = await indexFor(url, "raw1");
      await indexFor(url, "raw1");
      return a;
    });
    expect(first.status).toBe(200);
    expect(Buffer.byteLength(first.text)).toBeLessThanOrEqual(2048);
    expect(first.views.length).toBeLessThan(16);
    expect(first.current).toBe(idOf(1));
    const ids = first.views.map((v) => v.id);
    expect(ids).toContain(idOf(1));
    expect(ids).toContain(idOf(0)); // el parent de current no se quita
    // se quitan desde el final: lo que queda es un prefijo de la lista
    expect(ids).toEqual(views.slice(0, ids.length).map((v) => v.id));
    expect(validateIndex(first.text).ok).toBe(true);

    const warnings = lines.filter((l) => l.includes("index-trimmed"));
    expect(warnings.length, "una vez por dibujo, aunque se pida dos veces").toBe(1);
    expect(warnings[0]).toContain(String(16 - ids.length));
  });

  it("con las vistas de prueba de siempre el índice no cambia y no hay aviso", async () => {
    const engine = engineWith("text", ["hoy", "pendientes", "agenda"]);
    const url = await serve(engine);
    const drawn = await engine.index("local", P124);
    if (!drawn.ok) throw new Error("engine failed");
    const { value, lines } = await captureStdout(() => indexFor(url, "raw1"));
    expect(value.views.map((v) => v.id)).toEqual(drawn.value.views.map((v) => v.id));
    expect(Buffer.byteLength(value.text)).toBeLessThanOrEqual(2048);
    expect(lines.some((l) => l.includes("index-trimmed"))).toBe(false);
    expect(lines.some((l) => l.includes("zones-trimmed"))).toBe(false);
  });
});
