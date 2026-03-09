import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenAiApiSnapshot } from "../../src/providers/openaiApi.js";
import { makeConfig } from "../helpers.js";

describe("getOpenAiApiSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns budget minus costs on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ amount: { value: 12.5 } }, { amount: { value: 7.5 } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig({ OPENAI_MONTHLY_BUDGET_USD: 50 });
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.usedUsd).toBe(20);
    expect(snapshot.limitUsd).toBe(50);
    expect(snapshot.remainingUsd).toBe(30);
  });

  it("returns error when budget is missing", async () => {
    const config = makeConfig({ OPENAI_MONTHLY_BUDGET_USD: undefined });
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toContain("OPENAI_MONTHLY_BUDGET_USD");
  });

  it("returns unauthorized for 401/403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("unauthorized");
  });

  it("returns error on non-ok responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("error");
  });
});
