import { afterEach, describe, expect, it, vi } from "vitest";
import { getCursorDetails, getCursorSnapshot } from "../../src/providers/cursor.js";
import { makeConfig } from "../helpers.js";

describe("getCursorSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns billing usage from Cursor dashboard endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            billingCycleStart: "1772956730000",
            billingCycleEnd: "1775635130000",
            planUsage: {
              includedSpend: 1596,
              remaining: 404,
              limit: 2000,
              autoPercentUsed: 0,
              apiPercentUsed: 35.46666666666667
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aggregations: [
              { modelIntent: "gpt-5.3-codex", totalCents: 1362.482085 },
              { modelIntent: "default", totalCents: 268.117275 },
              { modelIntent: "gpt-5.4-medium", totalCents: 236.72925 }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getCursorSnapshot(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.usedUsd).toBe(15.96);
    expect(snapshot.remainingUsd).toBe(4.04);
    expect(snapshot.limitUsd).toBe(20);
    expect(snapshot.resetAt).toBe("2026-04-08T07:58:50.000Z");
    expect(snapshot.message).toContain("gpt-5.3-codex $13.62");
    expect(snapshot.message).not.toContain("Usage mix");
  });

  it("returns usage mix details for the dedicated cursor command", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            billingCycleStart: "1772956730000",
            billingCycleEnd: "1775635130000",
            planUsage: {
              includedSpend: 1596,
              remaining: 404,
              limit: 2000,
              autoPercentUsed: 0,
              apiPercentUsed: 35.46666666666667
            }
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            aggregations: [
              {
                modelIntent: "gpt-5.3-codex",
                inputTokens: "4114698",
                outputTokens: "154395",
                cacheReadTokens: "26365440",
                totalCents: 1362.482085,
                tier: 1
              },
              {
                modelIntent: "default",
                inputTokens: "853942",
                outputTokens: "117011",
                cacheReadTokens: "6430208",
                totalCents: 268.117275,
                tier: 0
              }
            ],
            totalInputTokens: "4968640",
            totalOutputTokens: "271406",
            totalCacheReadTokens: "32795648",
            totalCostCents: 1630.59936
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const details = await getCursorDetails(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(details.usageMix?.autoPercentUsed).toBe(0);
    expect(details.usageMix?.apiPercentUsed).toBe(35.46666666666667);
    expect(details.teamId).toBe(-1);
    expect(details.sourceDashboard).toBe("cursor.com/dashboard?tab=billing");
    expect(details.topModels).toEqual([
      { modelIntent: "gpt-5.3-codex", totalUsd: 13.624821 },
      { modelIntent: "default", totalUsd: 2.681173 }
    ]);
    expect(details.modelUsage).toEqual({
      aggregations: [
        {
          modelIntent: "gpt-5.3-codex",
          inputTokens: 4114698,
          outputTokens: 154395,
          cacheReadTokens: 26365440,
          totalUsd: 13.624821,
          tier: 1
        },
        {
          modelIntent: "default",
          inputTokens: 853942,
          outputTokens: 117011,
          cacheReadTokens: 6430208,
          totalUsd: 2.681173,
          tier: 0
        }
      ],
      totals: {
        inputTokens: 4968640,
        outputTokens: 271406,
        cacheReadTokens: 32795648,
        totalUsd: 16.305994
      }
    });
  });

  it("returns error when dashboard cookie is missing", async () => {
    const snapshot = await getCursorSnapshot(
      makeConfig({ CURSOR_DASHBOARD_COOKIE: undefined }),
      new Date("2026-03-09T10:00:00.000Z")
    );

    expect(snapshot.status).toBe("error");
    expect(snapshot.message).toContain("CURSOR_DASHBOARD_COOKIE");
  });

  it("returns unauthorized when Cursor redirects to login", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("https://api.workos.com/user_management/authorize", { status: 307 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshot = await getCursorSnapshot(makeConfig(), new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("unauthorized");
  });
});
