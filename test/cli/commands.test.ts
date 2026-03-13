import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs, printHelp, runGlobalUpdate } from "../../src/cli.js";

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

  it("parses version flags", () => {
    expect(parseArgs(["--version"])).toMatchObject({ command: "version" });
    expect(parseArgs(["-v"])).toMatchObject({ command: "version" });
  });

  it("parses env subcommands", () => {
    expect(parseArgs(["env", "download"])).toMatchObject({ command: "env-download" });
    expect(parseArgs(["env", "upload"])).toMatchObject({ command: "env-upload" });
  });

  it("parses update command", () => {
    expect(parseArgs(["update"])).toMatchObject({ command: "update" });
  });

  it("runs global npm install for update", async () => {
    const child = new EventEmitter();
    const spawnMock = vi.fn().mockImplementation(() => {
      queueMicrotask(() => {
        child.emit("exit", 0);
      });
      return child;
    });

    await runGlobalUpdate(spawnMock as never, {
      name: "@reals3bi/ai-cost",
      version: "1.1.0"
    });

    expect(spawnMock).toHaveBeenCalledWith(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--global", "@reals3bi/ai-cost@latest"],
      { stdio: "inherit" }
    );
  });

  it("prints help for provider detail commands", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    printHelp();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("ai-cost codex");
    expect(output).toContain("ai-cost openai");
    expect(output).toContain("ai-cost openrouter");
    expect(output).toContain("ai-cost cursor --models");
    expect(output).toContain("ai-cost --version");
    expect(output).toContain("ai-cost env download");
    expect(output).toContain("ai-cost env upload");
    expect(output).toContain("ai-cost update");
  });
});
