import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLI_APP_DIR, loadClientProviderConfig } from "../../src/cli/client-config.js";

const tempDirs: string[] = [];

describe("client config", () => {
  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      })
    );
  });

  it("loads defaults when the local env file does not exist", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-cost-client-config-"));
    tempDirs.push(directory);
    const envPath = path.join(directory, "missing.env");

    const config = await loadClientProviderConfig(envPath);

    expect(config.envFilePath).toBe(envPath);
    expect(config.CODEX_HOME).toContain(".codex");
    expect(config.APP_DATA_DIR).toBe(CLI_APP_DIR);
    expect(config.CURSOR_TEAM_ID).toBe(-1);
    expect(config.PROVIDER_TIMEOUT_MS).toBe(10000);
  });

  it("parses local provider values from the configured env file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-cost-client-config-"));
    tempDirs.push(directory);
    const envPath = path.join(directory, "config.env");
    await writeFile(
      envPath,
      [
        "CODEX_HOME=/custom/codex",
        "APP_DATA_DIR=/custom/data",
        "CURSOR_DASHBOARD_COOKIE=test.jwt.value",
        "CURSOR_TEAM_ID=12",
        "OPENAI_API_KEY=sk-local",
        "OPENAI_ORG_ID=org-local",
        "OPENAI_MONTHLY_BUDGET_USD=42.5",
        "OPENROUTER_API_KEY=or-local",
        "PROVIDER_TIMEOUT_MS=2500"
      ].join("\n"),
      "utf8"
    );

    const config = await loadClientProviderConfig(envPath);

    expect(config.CODEX_HOME).toBe("/custom/codex");
    expect(config.APP_DATA_DIR).toBe("/custom/data");
    expect(config.CURSOR_DASHBOARD_COOKIE).toBe("test.jwt.value");
    expect(config.CURSOR_TEAM_ID).toBe(12);
    expect(config.OPENAI_API_KEY).toBe("sk-local");
    expect(config.OPENAI_ORG_ID).toBe("org-local");
    expect(config.OPENAI_MONTHLY_BUDGET_USD).toBe(42.5);
    expect(config.OPENROUTER_API_KEY).toBe("or-local");
    expect(config.PROVIDER_TIMEOUT_MS).toBe(2500);
  });

  it("normalizes legacy JSON-escaped Windows paths from the env file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-cost-client-config-"));
    tempDirs.push(directory);
    const envPath = path.join(directory, "config.env");
    await writeFile(
      envPath,
      [
        String.raw`CODEX_HOME="C:\\Users\\Sebastian\\.codex"`,
        String.raw`APP_DATA_DIR="C:\\Users\\Sebastian\\.ai-cost"`
      ].join("\n"),
      "utf8"
    );

    const config = await loadClientProviderConfig(envPath);

    expect(config.CODEX_HOME).toBe(String.raw`C:\Users\Sebastian\.codex`);
    expect(config.APP_DATA_DIR).toBe(String.raw`C:\Users\Sebastian\.ai-cost`);
  });
});
