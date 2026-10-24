import { describe, expect, it } from "vitest";
import { cdpBase, chromiumDockerArgs } from "./chromium.ts";

describe("chromiumDockerArgs", () => {
  const args = chromiumDockerArgs("tintero-chromium-x", 0, "/f", "img@sha256:abc");

  it("hardens the container", () => {
    for (const piece of [
      "-p",
      "127.0.0.1:0:9222",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "512m",
      "--pids-limit",
      "256",
      "--mount",
      "type=bind,source=/f,target=/tintero/fonts,readonly",
      "img@sha256:abc",
    ]) {
      expect(args).toContain(piece);
    }
  });

  it("has no volume, privilege, host network or open address", () => {
    for (const piece of ["-v", "--privileged", "--network", "host"]) {
      expect(args).not.toContain(piece);
    }
    expect(args.join(" ")).not.toContain("0.0.0.0");
  });

  it("puts the image before the browser flags, which come last", () => {
    expect(args.slice(args.indexOf("img@sha256:abc") + 1)).toEqual([
      "--font-render-hinting=full",
      "--disable-font-subpixel-positioning",
      "--disable-lcd-text",
    ]);
    expect(args.slice(0, 4)).toEqual(["run", "--rm", "-d", "--name"]);
  });
});

describe("cdpBase", () => {
  it("accepts only http://127.0.0.1:<port>", () => {
    expect(cdpBase("http://127.0.0.1:9222")).toBe("http://127.0.0.1:9222");
    for (const bad of [
      "http://192.0.2.1:9222",
      "http://localhost:9222",
      "https://127.0.0.1:9222",
      "http://127.0.0.1",
      "http://127.0.0.1:0",
      "http://127.0.0.1:70000",
      "http://127.0.0.1:9222/",
      "http://127.0.0.1:9222@evil.example",
      "ws://127.0.0.1:9222",
      "",
    ]) {
      expect(() => cdpBase(bad)).toThrow();
    }
  });
});
