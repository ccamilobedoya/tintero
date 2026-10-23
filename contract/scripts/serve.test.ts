import { describe, expect, it } from "vitest";
import { dockerArgs, imageFrom } from "./serve.ts";

describe("dockerArgs", () => {
  for (const kind of ["docs", "mock"] as const) {
    it(`${kind}: uses --mount and keeps a path with ":" intact, without -v`, () => {
      const spec = "/tmp/odd:dir/v1.json";
      const args = dockerArgs(kind, spec, 9000);
      expect(args).not.toContain("-v");
      const mount = args[args.indexOf("--mount") + 1];
      expect(mount?.startsWith(`type=bind,source=${spec},target=/`)).toBe(true);
      expect(args.some((arg) => arg.startsWith("127.0.0.1:9000:"))).toBe(true);
    });
  }

  it("importing the module does not start docker (this test would hang otherwise)", () => {
    expect(imageFrom("A_IMAGE=foo/bar:1\n", "A_IMAGE")).toBe("foo/bar:1");
    expect(() => imageFrom("", "A_IMAGE")).toThrow();
  });
});
