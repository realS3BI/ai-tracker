import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs, printHelp } from "../../src/cli.js";

describe("cli commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses codex command", () => {
    expect(parseArgs(["codex"])).toMatchObject({ command: "codex" });
  });

  it("parses openai command", () => {
    expect(parseArgs(["openai"])).toMatchObject({ command: "openai" });
  });

  it("parses openrouter command", () => {
    expect(parseArgs(["openrouter"])).toMatchObject({ command: "openrouter" });
  });

  it("parses cursor model table flag", () => {
    expect(parseArgs(["cursor", "--models"])).toMatchObject({ command: "cursor", models: true });
  });

  it("prints help for provider detail commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    printHelp();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("ai-cost codex");
    expect(output).toContain("ai-cost openai");
    expect(output).toContain("ai-cost openrouter");
    expect(output).toContain("ai-cost cursor --models");
  });
});
