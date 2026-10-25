import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LABEL = "tintero.chromium=1";
export const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** Image pinned in tools/images.conf. */
export function pinnedImage(): string {
  const text = readFileSync(`${REPO}tools/images.conf`, "utf8");
  const found = /^CHROMIUM_IMAGE=(\S+)/m.exec(text);
  if (!found?.[1]) throw new Error("CHROMIUM_IMAGE missing");
  return found[1];
}

export function docker(args: string[]): string {
  return execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1_048_576,
  });
}

export const INSTANCE_LABEL = "tintero.instance";

/** Ids (running or not) of containers of one instance. */
export function labelled(instance: string): string[] {
  return docker([
    "ps",
    "-aq",
    "--filter",
    `label=${LABEL}`,
    "--filter",
    `label=${INSTANCE_LABEL}=${instance}`,
  ])
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function running(name: string): boolean {
  return (
    docker(["ps", "-q", "--filter", `name=^${name}$`])
      .split("\n")
      .filter((s) => s.trim() !== "").length > 0
  );
}

/** Launches a container of the pinned image that just sleeps. */
export function launchSleeper(name: string, instance?: string, withBase = true): void {
  const label = [
    ...(withBase ? ["--label", LABEL] : []),
    ...(instance === undefined ? [] : ["--label", `${INSTANCE_LABEL}=${instance}`]),
  ];
  docker([
    "run",
    "-d",
    "--rm",
    "--name",
    name,
    ...label,
    "--entrypoint",
    "/bin/sleep",
    pinnedImage(),
    "600",
  ]);
}

/** Removes by name, never fails. */
export function forceRemove(names: string[]): void {
  for (const n of names) {
    try {
      docker(["rm", "-f", n]);
    } catch {
      /* already gone */
    }
  }
}
