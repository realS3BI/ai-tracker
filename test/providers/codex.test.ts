import { describe, expect, it } from "vitest";
import { getCodexSnapshot } from "../../src/providers/codex.js";
import { makeConfig } from "../helpers.js";

const primaryResetAt = new Date(1773095381 * 1000).toISOString();
const secondaryResetAt = new Date(1773564753 * 1000).toISOString();

describe("codex provider", () => {
  it("reads the latest account rate limits from local session logs", async () => {
    const snapshot = await getCodexSnapshot(makeConfig(), new Date("2026-03-09T21:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.provider).toBe("openai-codex");
    expect(snapshot.remainingDisplay).toBe("96.0% / 87.0%");
    expect(snapshot.usedDisplay).toBe("4.0% / 13.0%");
    expect(snapshot.limitDisplay).toBe("5h / 7d");
    expect(snapshot.resetAt).toBe(primaryResetAt);
    expect(snapshot.secondaryResetAt).toBe(secondaryResetAt);
    expect(snapshot.message).toBe("Local Codex session limits");
  });
});
