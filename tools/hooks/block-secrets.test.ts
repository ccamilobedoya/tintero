import { describe, expect, it } from "vitest";
import { decide, forbiddenGit, mentionsSecretPath } from "./block-secrets.ts";

describe("mentionsSecretPath", () => {
  it.each([
    "cat .env",
    "less ./.env.local",
    "grep TOKEN .env",
    "cat ~/.config/app/env",
    "head $HOME/.config/x",
  ])("blocks %s", (command) => {
    expect(mentionsSecretPath(command)).toBe(true);
  });

  it.each([
    "npm run lint",
    "cat .envrc-notes.md",
    "git status",
    "echo environment",
    "cat docs/env.md",
  ])("allows %s", (command) => {
    expect(mentionsSecretPath(command)).toBe(false);
  });
});

describe("decide", () => {
  it("blocks when the payload cannot be read (fails closed)", () => {
    expect(decide("not json")).toBe(2);
  });

  it("allows a normal command and blocks a secret one", () => {
    expect(decide(JSON.stringify({ tool_input: { command: "npm test" } }))).toBe(0);
    expect(decide(JSON.stringify({ tool_input: { command: "cat .env" } }))).toBe(2);
  });
});

describe("forbiddenGit", () => {
  it.each([
    "git commit --no-verify -m x",
    "git commit -n -m x",
    "git -c core.hooksPath=/dev/null commit -m x",
    "git push origin --force",
    "git push -u origin -f main",
    "git push origin --force-with-lease",
    "git push origin +main",
    "git push origin :main",
    "git push origin --delete dev/F-001",
    "git push --no-verify",
    "git filter-branch --all",
    "cd x && git update-ref refs/heads/main abc",
  ])("blocks %s", (command) => {
    expect(forbiddenGit(command)).toBeDefined();
  });

  it.each([
    "git push -u origin dev/F-001",
    "git push origin main",
    "git commit -m 'F-001 código: algo'",
    "git merge --no-ff acc/F-001 -m x",
    "npm run test",
    "git push -u https://github.com/a/b.git main",
  ])("allows %s", (command) => {
    expect(forbiddenGit(command)).toBeUndefined();
  });
});
