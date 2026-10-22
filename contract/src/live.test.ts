// Checks against the running simulator and viewer (npm run contract:mock / contract:docs).
// Skipped unless both are listening on 127.0.0.1 (the only address it ever contacts).
import { describe, expect, it } from "vitest";
import { validateIndex, validateZones } from "./index.ts";

const MOCK = "http://127.0.0.1:4010";
const DOCS = "http://127.0.0.1:8099";
const headers = {
  "Tintero-Protocol": "1",
  "Tintero-Firmware": "0.1.0",
  "Tintero-Power": "usb",
  "Tintero-Formats": "raw1",
  "Tintero-Panel": "w=800,h=480,dpi=124,depth=1",
};

async function listening(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(500) });
    return true;
  } catch {
    return false;
  }
}
const live = (await listening(MOCK)) && (await listening(DOCS));

describe.skipIf(!live)("live simulator and viewer", () => {
  it("mock serves a valid index and zones, and rejects a missing header", async () => {
    const index = await fetch(`${MOCK}/api/v1/index`, { headers });
    expect(index.status).toBe(200);
    expect(validateIndex(await index.text()).ok).toBe(true);

    const zones = await fetch(`${MOCK}/api/v1/views/todo/zones?h=9f2c1a7b`, { headers });
    expect(zones.status).toBe(200);
    const panel = { w: 800, h: 480, dpi: 124, depth: 1 as const };
    expect(validateZones(await zones.text(), panel).ok).toBe(true);

    const incomplete = Object.fromEntries(
      Object.entries(headers).filter(([name]) => name !== "Tintero-Power"),
    );
    const rejected = await fetch(`${MOCK}/api/v1/index`, { headers: incomplete });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    expect(rejected.status).toBeLessThan(500);
  });

  it("viewer serves the page and the specification", async () => {
    const page = await fetch(`${DOCS}/`);
    expect(page.status).toBe(200);
    const spec = await fetch(`${DOCS}/v1.json`);
    expect(spec.status).toBe(200);
    const initializer = await fetch(`${DOCS}/swagger-initializer.js`);
    expect(await initializer.text()).toContain("v1.json");
  });
});
