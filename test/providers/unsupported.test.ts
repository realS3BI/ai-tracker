import path from "node:path";
import { describe, expect, it } from "vitest";
import { getCodexSnapshot } from "../../src/providers/codex.js";
import { getCursorSnapshot } from "../../src/providers/cursor.js";
import { makeConfig } from "../helpers.js";

describe("unsupported providers", () => {
  it("codex returns unsupported status when no local session data exists", async () => {
    const snapshot = await getCodexSnapshot(makeConfig({ CODEX_HOME: path.resolve(process.cwd(), "test", "fixtures", "missing-codex-home") }), new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.provider).toBe("openai-codex");
  });

  it("cursor returns unsupported status", async () => {
    const snapshot = await getCursorSnapshot(new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.provider).toBe("cursor");
  });
});
