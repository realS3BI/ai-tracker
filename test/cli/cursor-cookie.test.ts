import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractCursorSessionToken,
  saveCursorCookieToEnv,
  upsertEnvValue
} from "../../src/cli/cursor-cookie.js";

const tempDirs: string[] = [];

describe("cursor cookie helper", () => {
  afterEach(async () => {
    for (const directory of tempDirs.splice(0)) {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("extracts the token from a cookie header", () => {
    const token = extractCursorSessionToken("foo=bar; WorkosCursorSessionToken=test.jwt.value; another=value");
    expect(token).toBe("test.jwt.value");
  });

  it("extracts the token from a pasted Windows curl command", () => {
    const token = extractCursorSessionToken(
      'curl ^"https://cursor.com/api/dashboard/get-current-period-usage^" ^\n  -b ^"foo=bar; WorkosCursorSessionToken=test.jwt.value; baz=1^"'
    );
    expect(token).toBe("test.jwt.value");
  });

  it("accepts a raw token value", () => {
    const token = extractCursorSessionToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature");
    expect(token).toBe("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature");
  });

  it("writes the extracted token into the env file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-cost-cursor-cookie-"));
    tempDirs.push(directory);
    const envFilePath = path.join(directory, ".env");

    await upsertEnvValue(envFilePath, "OPENAI_API_KEY", "sk-test");
    await saveCursorCookieToEnv(envFilePath, "WorkosCursorSessionToken=test.jwt.value");

    const next = await readFile(envFilePath, "utf8");
    expect(next).toContain("OPENAI_API_KEY=sk-test");
    expect(next).toContain("CURSOR_DASHBOARD_COOKIE=test.jwt.value");
  });

  it("writes Windows paths without JSON-escaping backslashes", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "ai-cost-cursor-cookie-"));
    tempDirs.push(directory);
    const envFilePath = path.join(directory, ".env");

    await upsertEnvValue(envFilePath, "CODEX_HOME", String.raw`C:\Users\Sebastian\.codex`);

    const next = await readFile(envFilePath, "utf8");
    expect(next).toContain(String.raw`CODEX_HOME=C:\Users\Sebastian\.codex`);
    expect(next).not.toContain(String.raw`CODEX_HOME="C:\\Users\\Sebastian\\.codex"`);
  });
});
