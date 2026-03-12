import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenAiApiDetails, getOpenAiApiSnapshot } from "../../src/providers/openaiApi.js";
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
          data: [{ results: [{ amount: { value: 12.5 } }, { amount: { value: 7.5 } }] }]
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
    expect(snapshot.resetAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("returns current-month costs when budget is missing", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ results: [{ amount: { value: 12.5 } }, { amount: { value: 7.5 } }] }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig({ OPENAI_MONTHLY_BUDGET_USD: undefined });
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.usedUsd).toBe(20);
    expect(snapshot.limitUsd).toBeUndefined();
    expect(snapshot.remainingUsd).toBeUndefined();
    expect(snapshot.resetAt).toBeUndefined();
    expect(snapshot.message).toBe("Official OpenAI organization costs for the current month.");
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

  it("supports the direct amount fallback shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ amount: { value: 4 } }, { value: 3 }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig({ OPENAI_MONTHLY_BUDGET_USD: undefined });
    const snapshot = await getOpenAiApiSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.usedUsd).toBe(7);
  });

  it("returns detail metadata for the current utc billing period", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ amount: { value: 4 } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const details = await getOpenAiApiDetails(
      makeConfig({
        OPENAI_MONTHLY_BUDGET_USD: 50,
        OPENAI_ORG_ID: "org_123"
      }),
      new Date("2026-03-09T10:00:00.000Z")
    );

    expect(details.periodStart).toBe("2026-03-01T00:00:00.000Z");
    expect(details.periodEnd).toBe("2026-03-09T10:00:00.000Z");
    expect(details.periodTimezone).toBe("UTC");
    expect(details.budgetUsd).toBe(50);
    expect(details.budgetConfigured).toBe(true);
    expect(details.organizationHeaderConfigured).toBe(true);
    expect(details.endpoint).toBe("/v1/organization/costs");
    expect(details.snapshot.usedUsd).toBe(4);
  });

  it("returns detail metadata for unauthorized responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const details = await getOpenAiApiDetails(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(details.snapshot.status).toBe("unauthorized");
    expect(details.budgetConfigured).toBe(true);
    expect(details.organizationHeaderConfigured).toBe(false);
    expect(details.endpoint).toBe("/v1/organization/costs");
  });
});
