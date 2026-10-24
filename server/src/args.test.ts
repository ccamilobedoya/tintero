import { describe, expect, it } from "vitest";
import { parseOptions, UsageError } from "./args.ts";

describe("engine options", () => {
  it("take --views and --data together, with an optional local Chromium", () => {
    const options = parseOptions(["--views", "v.json", "--data", "d.json"]);
    expect(options).toMatchObject({ views: "v.json", data: "d.json" });
    expect(options.chromium).toBeUndefined();
    expect(
      parseOptions(["--views", "v", "--data", "d", "--chromium", "http://127.0.0.1:9222"]).chromium,
    ).toBe("http://127.0.0.1:9222");
  });

  it("have no engine files by default", () => {
    const options = parseOptions([]);
    expect(options.views).toBeUndefined();
    expect(options.data).toBeUndefined();
  });

  it("reject a lone --views or --data and a Chromium that is not 127.0.0.1", () => {
    expect(() => parseOptions(["--views", "v.json"])).toThrow(UsageError);
    expect(() => parseOptions(["--data", "d.json"])).toThrow(UsageError);
    expect(() => parseOptions(["--chromium", "http://127.0.0.1:9222"])).toThrow(UsageError);
    for (const bad of ["http://192.0.2.1:9222", "http://localhost:9222", "https://127.0.0.1:1"]) {
      expect(() => parseOptions(["--views", "v", "--data", "d", "--chromium", bad])).toThrow(
        UsageError,
      );
    }
  });
});
