/* eslint-disable security/detect-non-literal-fs-filename -- fuentes del firmware del repo */
// CA20 (compila y cabe) y CA21 (revisión del texto de firmware/src).
// CA22 es del dueño, en el panel real (A3): no lleva prueba automática.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, run } from "./helpers.ts";

const SRC = join(ROOT, "firmware/src");
const sources = (): { name: string; text: string }[] =>
  readdirSync(SRC)
    .filter((f) => /\.(h|cpp|ino)$/.test(f))
    .map((name) => ({ name, text: readFileSync(join(SRC, name), "utf8") }));
const all = (): string =>
  sources()
    .map((s) => s.text)
    .join("\n");
const fileText = (name: string): string => readFileSync(join(SRC, name), "utf8");

describe("CA21 revisión del código de firmware/src", () => {
  it("HTTPClient no aparece en ningún archivo", () => {
    const hits = sources()
      .filter((s) => s.text.includes("HTTPClient"))
      .map((s) => s.name);
    expect(hits).toEqual([]);
  });

  it("el watchdog: esp_task_wdt_add, esp_task_wdt_reset y esp_task_wdt_reconfigure aparecen", () => {
    const text = all();
    expect(text).toContain("esp_task_wdt_add");
    expect(text).toContain("esp_task_wdt_reset");
    expect(text).toContain("esp_task_wdt_reconfigure");
    expect(text).toContain("trigger_panic");
  });

  it("Tintero-Formats vale pb1,raw1 y Tintero-Firmware es esp32-0.2", () => {
    const tintero = fileText("tintero.cpp");
    const line = tintero.split("\n").find((l) => l.includes("Tintero-Formats"));
    expect(line).toBeDefined();
    expect(line).toContain('"pb1,raw1"');
    expect(tintero).toContain("esp32-0.2");
  });

  it("http_reader, packbits y recovery (.cpp y .h) no incluyen Arduino.h", () => {
    for (const f of ["http_reader", "packbits", "recovery"]) {
      for (const ext of ["h", "cpp"]) {
        expect(fileText(`${f}.${ext}`), `${f}.${ext}`).not.toMatch(
          /#\s*include\s*[<"]Arduino\.h[>"]/,
        );
      }
    }
  });

  it("el cliente usa NetworkClientSecure y el lector http::readResponse; no aparece setInsecure", () => {
    const tintero = fileText("tintero.cpp");
    expect(tintero).toContain("NetworkClientSecure");
    expect(tintero).toContain("readResponse");
    expect(all()).not.toContain("setInsecure");
  });

  it("el reinicio controlado y los avisos guardan lo que dice R6 y R7", () => {
    const text = all();
    expect(text).toContain("RTC_NOINIT_ATTR");
    expect(text).toContain("ESP.restart");
    expect(text).toContain("heap_caps_get_largest_free_block");
    expect(text).toContain("esp_reset_reason");
    expect(text).toContain("backoffMs");
    expect(text).toContain("formatFailure");
  });

  it("platformio.ini fija ArduinoJson en 7.4.2", () => {
    const ini = readFileSync(join(ROOT, "firmware/platformio.ini"), "utf8");
    const line = ini.split("\n").find((l) => l.includes("ArduinoJson"));
    expect(line).toBeDefined();
    expect(line).toMatch(/7\.4\.2/);
    expect(line).not.toMatch(/[\^~]/);
  });
});

describe("CA20 el firmware compila y cabe", () => {
  it("tools/compilar-firmware sale con 0, sin avisos en src/; flash ≤ 1 900 000 y RAM ≤ 110 856", async () => {
    const r = await run("tools/compilar-firmware", [], 590_000);
    expect(r.code, r.out.slice(-3000)).toBe(0);
    expect(r.out).toContain("SUCCESS");
    const warnings = r.out.split("\n").filter((l) => /^src\/.*(warning|error)/.test(l));
    expect(warnings).toEqual([]);
    const ram = /^RAM:.*used (\d+) bytes/m.exec(r.out);
    const flash = /^Flash:.*used (\d+) bytes/m.exec(r.out);
    expect(ram, r.out.slice(-1500)).not.toBeNull();
    expect(flash, r.out.slice(-1500)).not.toBeNull();
    expect(Number(ram?.[1])).toBeLessThanOrEqual(110_856);
    expect(Number(flash?.[1])).toBeLessThanOrEqual(1_900_000);
  }, 600_000);
});
