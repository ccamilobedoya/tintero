import { describe, expect, it } from "vitest";
import { parseAgent } from "./agent-json.ts";

describe("parseAgent", () => {
  it("reads name, description, tools, model and prompt", () => {
    const md =
      "---\nname: x\ndescription: Hace algo.\ntools: Read, Bash\nmodel: haiku\n---\n\nInstrucciones.\n";
    expect(parseAgent(md)).toEqual({
      name: "x",
      definition: {
        description: "Hace algo.",
        prompt: "Instrucciones.",
        tools: ["Read", "Bash"],
        model: "haiku",
      },
    });
  });

  it("rejects a file without frontmatter", () => {
    expect(() => parseAgent("sin frontmatter")).toThrow(/frontmatter/);
  });
});
