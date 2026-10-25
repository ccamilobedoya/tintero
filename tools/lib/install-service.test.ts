import { describe, expect, it } from "vitest";
import { InstallError, parseServiceEnv, renderUnit } from "./install-service.ts";

const ENV = "TINTERO_DIR=/srv/t\nTINTERO_NODE=/usr/bin/node\nTINTERO_ARGS=--port 8790\n";

describe("install-service", () => {
  it("fills every marker of the template", () => {
    const unit = renderUnit(
      "W=@TINTERO_DIR@\nE=@NODE@ server/src/main.ts @ARGS@\n",
      parseServiceEnv(ENV),
    );
    expect(unit).toBe("W=/srv/t\nE=/usr/bin/node server/src/main.ts --port 8790\n");
  });

  it("names the missing keys and rejects values that could inject lines", () => {
    expect(() => parseServiceEnv("TINTERO_NODE=n\nTINTERO_ARGS=a\n")).toThrow(/TINTERO_DIR/);
    expect(() => parseServiceEnv(ENV.replace("--port 8790", "a\rExecStartPost=x"))).toThrow(
      InstallError,
    );
    expect(() => parseServiceEnv(ENV.replace("/srv/t", "/srv/@NODE@"))).toThrow(InstallError);
    expect(() => parseServiceEnv(ENV.replace("/srv/t", "%h/t"))).toThrow(InstallError);
    expect(() => parseServiceEnv(ENV.replace("--port 8790", "--port $PORT"))).toThrow(InstallError);
  });

  it("refuses a template with markers left", () => {
    expect(() => renderUnit("X=@OTHER@", parseServiceEnv(ENV))).toThrow(InstallError);
  });
});
