import { describe, expect, it, vi } from "vitest";
import { issueCliToken, verifyCliToken } from "../../src/auth/token.js";

describe("cli token", () => {
  it("verifies a freshly issued token", () => {
    const token = issueCliToken("token-secret", 300);
    expect(verifyCliToken(token, "token-secret")).toBe(true);
  });

  it("rejects expired tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T10:00:00.000Z"));
    const token = issueCliToken("token-secret", 60);
    vi.setSystemTime(new Date("2026-03-09T10:02:00.000Z"));
    expect(verifyCliToken(token, "token-secret")).toBe(false);
    vi.useRealTimers();
  });
});
