import { describe, expect, it } from "vitest";
import { funnelValues, imageFrom, renderFunnel } from "./install-funnel.ts";
import { InstallError } from "./install-service.ts";

const ENV = {
  TINTERO_FUNNEL_DIR: "/tmp/f",
  TINTERO_TLS_PORT: "8443",
  TINTERO_AUTHKEY_FILE: "/tmp/k",
};
const IMAGE = `tailscale/tailscale@sha256:${"a".repeat(64)}`;

describe("install-funnel", () => {
  it("fills the image, the key file and the port", () => {
    const out = renderFunnel(
      'image: @TAILSCALE_IMAGE@\nuser: "@UID@:@GID@"\nenv_file: [@AUTHKEY_FILE@]\n',
      '{"TCPForward": "127.0.0.1:@TINTERO_TLS_PORT@", "d": "${TS_CERT_DOMAIN}"}',
      funnelValues(ENV),
      IMAGE,
      { uid: 1000, gid: 1000 },
    );
    expect(out.compose).toBe(`image: ${IMAGE}\nuser: "1000:1000"\nenv_file: [/tmp/k]\n`);
    expect(out.serve).toBe('{"TCPForward": "127.0.0.1:8443", "d": "${TS_CERT_DOMAIN}"}');
  });

  it("refuses to run the node as root", () => {
    expect(() => renderFunnel("x", "y", funnelValues(ENV), IMAGE, { uid: 0, gid: 0 })).toThrow(
      InstallError,
    );
  });

  it("rejects low ports, relative paths and an unpinned image", () => {
    expect(() => funnelValues({ ...ENV, TINTERO_TLS_PORT: "80" })).toThrow(InstallError);
    expect(() => funnelValues({ ...ENV, TINTERO_TLS_PORT: "8443x" })).toThrow(InstallError);
    expect(() => funnelValues({ ...ENV, TINTERO_FUNNEL_DIR: "f" })).toThrow(InstallError);
    expect(() => imageFrom("TAILSCALE_IMAGE=tailscale/tailscale:stable\n")).toThrow(InstallError);
    expect(imageFrom(`X=1\nTAILSCALE_IMAGE=${IMAGE}   # 1.104.2\n`)).toBe(IMAGE);
  });
});
