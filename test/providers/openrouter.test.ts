import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenRouterDetails, getOpenRouterSnapshot } from "../../src/providers/openrouter.js";
import { makeConfig } from "../helpers.js";

describe("getOpenRouterSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns credits data from official endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            total_credits: 120,
            total_usage: 47.25
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limitUsd).toBe(120);
    expect(snapshot.usedUsd).toBe(47.25);
    expect(snapshot.remainingUsd).toBe(72.75);
  });

  it("rounds key window info to two decimals in notes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            total_credits: 120,
            total_usage: 47.25,
            limit: 30.9876,
            limit_remaining: 12.3456
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getOpenRouterSnapshot(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.message).toContain("Key limit remaining: $12.35 / $30.99.");
  });

  it("returns error when key is missing", async () => {
    const config = makeConfig({ OPENROUTER_API_KEY: undefined });
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("error");
  });

  it("returns unauthorized for 401/403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("unauthorized");
  });

  it("returns detail fields for credits and key window values", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            total_credits: 120,
            total_usage: 47.25,
            limit: 30.9876,
            limit_remaining: 12.3456
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const details = await getOpenRouterDetails(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(details.endpoint).toBe("/api/v1/credits");
    expect(details.totalCreditsUsd).toBe(120);
    expect(details.totalUsageUsd).toBe(47.25);
    expect(details.keyLimitUsd).toBe(30.9876);
    expect(details.keyRemainingUsd).toBe(12.3456);
    expect(details.hasKeyLimitWindow).toBe(true);
    expect(details.snapshot.status).toBe("ok");
  });

  it("reports missing per-key window details in provider metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            total_credits: 120,
            total_usage: 47.25
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const details = await getOpenRouterDetails(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(details.hasKeyLimitWindow).toBe(false);
    expect(details.keyLimitUsd).toBeUndefined();
    expect(details.keyRemainingUsd).toBeUndefined();
  });
});
