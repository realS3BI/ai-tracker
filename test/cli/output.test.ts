import { describe, expect, it } from "vitest";
import {
  formatCodexDetailsOutput,
  formatCursorDetailsOutput,
  formatOpenAiDetailsOutput,
  formatOpenRouterDetailsOutput,
  formatSnapshotOutput,
  renderTable
} from "../../src/cli.js";
import { formatResetTimeValue, formatResetValue } from "../../src/snapshot-view.js";
import type { SnapshotResponse } from "../../src/types.js";

const sampleSnapshot: SnapshotResponse = {
  generatedAt: "2026-03-09T10:00:00.000Z",
  providers: [
    {
      provider: "openai-codex",
      status: "ok",
      title: "OpenAI Codex Limits",
      remainingDisplay: "96%/87%",
      usedDisplay: "4%/13%",
      limitDisplay: "5h/7d",
      resetAt: "2026-03-09T20:56:21.000Z",
      secondaryResetAt: "2026-03-15T07:19:13.000Z",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Local Codex session limits",
      source: "local-codex-session"
    },
    {
      provider: "openai-api",
      status: "ok",
      title: "OpenAI API Balance",
      remainingUsd: 90,
      usedUsd: 10,
      limitUsd: 100,
      unit: "usd",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Monthly budget minus official OpenAI organization costs.",
      source: "official-api"
    },
    {
      provider: "openrouter",
      status: "ok",
      title: "OpenRouter Balance",
      remainingUsd: 8,
      usedUsd: 2,
      limitUsd: 10,
      unit: "usd",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Official OpenRouter credits endpoint.",
      source: "official-api"
    },
    {
      provider: "cursor",
      status: "unsupported",
      title: "Cursor Limits",
      updatedAt: "2026-03-09T10:00:00.000Z",
      message: "Official personal-account limits API is currently unavailable.",
      source: "official-docs-status"
    }
  ]
};

describe("cli output", () => {
  it("renders a terminal table", () => {
    const table = renderTable(sampleSnapshot);
    expect(table).toContain("Provider");
    expect(table).toContain("Reset");
    expect(table).toContain("OpenAI API");
    expect(table).toContain("96%/87%");
    expect(table).toContain("4%/13%");
    expect(table).toContain("5h/7d");
    expect(table).toContain(
      `${formatResetTimeValue("2026-03-09T20:56:21.000Z")} / ${formatResetValue("2026-03-15T07:19:13.000Z")}`
    );
    expect(table).toContain("$90.00");
  });

  it("renders cached values with an explicit cached status label", () => {
    const output = renderTable({
      generatedAt: "2026-03-09T10:00:00.000Z",
      providers: [
        {
          provider: "openai-codex",
          status: "ok",
          title: "OpenAI Codex Limits",
          remainingDisplay: "88%/70%",
          usedDisplay: "12%/30%",
          limitDisplay: "5h/7d",
          updatedAt: "2026-03-09T10:00:00.000Z",
          message: "Using cached Codex limits from the persisted fallback cache.",
          source: "codex-cache"
        }
      ]
    });

    expect(output).toContain("ok (cached)");
  });

  it("renders raw json output", () => {
    const output = formatSnapshotOutput(sampleSnapshot, true);
    const parsed = JSON.parse(output) as SnapshotResponse;
    expect(parsed.providers).toHaveLength(4);
    expect(parsed.generatedAt).toBe("2026-03-09T10:00:00.000Z");
  });

  it("renders detailed cursor output", () => {
    const output = formatCursorDetailsOutput(
      {
        snapshot: {
          provider: "cursor",
          status: "ok",
          title: "Cursor Limits",
          usedUsd: 15.96,
          remainingUsd: 4.04,
          limitUsd: 20,
          unit: "usd",
          updatedAt: "2026-03-09T10:00:00.000Z",
          resetAt: "2026-04-08T07:58:50.000Z",
          message: "Cursor dashboard billing usage. Top models: gpt-5.3-codex $13.62.",
          source: "official-dashboard-api"
        },
        usageMix: {
          autoPercentUsed: 0,
          apiPercentUsed: 35.46666666666667
        },
        topModels: [
          { modelIntent: "gpt-5.3-codex", totalUsd: 13.624821 },
          { modelIntent: "default", totalUsd: 2.681173 }
        ],
        billingCycleStart: "2026-03-08T07:58:50.000Z",
        billingCycleEnd: "2026-04-08T07:58:50.000Z",
        teamId: -1,
        sourceDashboard: "cursor.com/dashboard?tab=billing"
      },
      false
    );

    expect(output).toContain("Provider: Cursor");
    expect(output).toContain("Updated: 2026-03-09T10:00:00.000Z");
    expect(output).toContain("Source: official-dashboard-api");
    expect(output).toContain("Used: $15.96");
    expect(output).toContain("Remaining: $4.04");
    expect(output).toContain("Limit: $20.00");
    expect(output).toContain("Billing cycle: 2026-03-08T07:58:50.000Z .. 2026-04-08T07:58:50.000Z");
    expect(output).toContain("Team ID: -1");
    expect(output).toContain("Dashboard: cursor.com/dashboard?tab=billing");
    expect(output).toContain("Usage mix: auto 0.00%, api 35.47%");
    expect(output).toContain("Top models: gpt-5.3-codex $13.62, default $2.68");
    expect(output).toContain(`Reset: ${formatResetValue("2026-04-08T07:58:50.000Z")}`);
  });

  it("renders cursor model table when requested", () => {
    const output = formatCursorDetailsOutput(
      {
        snapshot: {
          provider: "cursor",
          status: "ok",
          title: "Cursor Limits",
          usedUsd: 15.96,
          remainingUsd: 4.04,
          limitUsd: 20,
          unit: "usd",
          updatedAt: "2026-03-09T10:00:00.000Z",
          resetAt: "2026-04-08T07:58:50.000Z",
          message: "Cursor dashboard billing usage. Top models: gpt-5.3-codex $13.62.",
          source: "official-dashboard-api"
        },
        usageMix: {
          autoPercentUsed: 0,
          apiPercentUsed: 35.46666666666667
        },
        topModels: [
          { modelIntent: "gpt-5.3-codex", totalUsd: 13.624821 },
          { modelIntent: "default", totalUsd: 3.377046 }
        ],
        modelUsage: {
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
              totalUsd: 3.377046,
              tier: 0
            }
          ],
          totals: {
            inputTokens: 4968640,
            outputTokens: 271406,
            cacheReadTokens: 32795648,
            totalUsd: 17.001867
          }
        },
        billingCycleStart: "2026-03-08T07:58:50.000Z",
        billingCycleEnd: "2026-04-08T07:58:50.000Z",
        teamId: -1,
        sourceDashboard: "cursor.com/dashboard?tab=billing"
      },
      false,
      true
    );

    expect(output).not.toContain("Provider: Cursor");
    expect(output).not.toContain("Billing cycle:");
    expect(output).toContain("Model         | Input tokens | Output tokens | Cache read | Cost   | Tier");
    expect(output).toContain("gpt-5.3-codex | 4,114,698    | 154,395       | 26,365,440 | $13.62 | 1");
    expect(output).toContain("default       | 853,942      | 117,011       | 6,430,208  | $3.38  | 0");
    expect(output).toContain("--------------+--------------+---------------+------------+--------+-----");
    expect(output).toContain("Total         | 4,968,640    | 271,406       | 32,795,648 | $17.00 | -");
  });

  it("renders detailed codex output", () => {
    const output = formatCodexDetailsOutput(
      {
        snapshot: {
          provider: "openai-codex",
          status: "ok",
          title: "OpenAI Codex Limits",
          remainingDisplay: "96%/87%",
          usedDisplay: "4%/13%",
          limitDisplay: "5h/7d",
          updatedAt: "2026-03-09T20:58:23.000Z",
          resetAt: "2026-03-09T20:56:21.000Z",
          secondaryResetAt: "2026-03-15T07:19:13.000Z",
          message: "Local Codex session limits",
          source: "local-codex-session"
        },
        codexHome: "/tmp/.codex",
        cachePath: "/tmp/.ai-cost/codex-cache.json",
        sourcePath: "/tmp/.codex/sessions/2026/03/09/session.jsonl",
        selectedLimitId: "codex",
        selectedLimitName: "Codex",
        planType: "plus",
        freshnessWindowHours: 12,
        primary: {
          usedPercent: 4,
          remainingPercent: 96,
          windowMinutes: 300,
          windowLabel: "5h",
          resetAt: "2026-03-09T20:56:21.000Z"
        },
        secondary: {
          usedPercent: 13,
          remainingPercent: 87,
          windowMinutes: 10080,
          windowLabel: "7d",
          resetAt: "2026-03-15T07:19:13.000Z"
        }
      },
      false
    );

    expect(output).toContain("Provider: OpenAI Codex");
    expect(output).toContain("Updated: 2026-03-09T20:58:23.000Z");
    expect(output).toContain("Source: local-codex-session");
    expect(output).toContain("Codex home: /tmp/.codex");
    expect(output).toContain("Cache path: /tmp/.ai-cost/codex-cache.json");
    expect(output).toContain("Session file: /tmp/.codex/sessions/2026/03/09/session.jsonl");
    expect(output).toContain("Freshness window: 12h");
    expect(output).toContain("Limit id: codex");
    expect(output).toContain("Limit name: Codex");
    expect(output).toContain("Plan type: plus");
    expect(output).toContain(`Primary window: 4% used, 96% remaining, 5h, reset ${formatResetValue("2026-03-09T20:56:21.000Z")}`);
    expect(output).toContain(
      `Secondary window: 13% used, 87% remaining, 7d, reset ${formatResetValue("2026-03-15T07:19:13.000Z")}`
    );
  });

  it("renders detailed openai output", () => {
    const output = formatOpenAiDetailsOutput(
      {
        snapshot: {
          provider: "openai-api",
          status: "ok",
          title: "OpenAI API Balance",
          usedUsd: 20,
          remainingUsd: 30,
          limitUsd: 50,
          unit: "usd",
          updatedAt: "2026-03-09T10:00:00.000Z",
          resetAt: "2026-04-01T00:00:00.000Z",
          message: "Monthly budget minus official OpenAI organization costs.",
          source: "official-api"
        },
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-09T10:00:00.000Z",
        periodTimezone: "UTC",
        budgetUsd: 50,
        budgetConfigured: true,
        organizationHeaderConfigured: false,
        endpoint: "/v1/organization/costs"
      },
      false
    );

    expect(output).toContain("Provider: OpenAI API");
    expect(output).toContain("Source: official-api");
    expect(output).toContain("Used: $20.00");
    expect(output).toContain("Remaining: $30.00");
    expect(output).toContain("Limit: $50.00");
    expect(output).toContain("Period: 2026-03-01T00:00:00.000Z .. 2026-03-09T10:00:00.000Z (UTC)");
    expect(output).toContain("Budget configured: yes");
    expect(output).toContain("Budget: $50.00");
    expect(output).toContain("Organization header: no");
    expect(output).toContain("Endpoint: /v1/organization/costs");
  });

  it("renders detailed openrouter output", () => {
    const output = formatOpenRouterDetailsOutput(
      {
        snapshot: {
          provider: "openrouter",
          status: "ok",
          title: "OpenRouter Balance",
          usedUsd: 47.25,
          remainingUsd: 72.75,
          limitUsd: 120,
          unit: "usd",
          updatedAt: "2026-03-09T10:00:00.000Z",
          message: "Official OpenRouter credits endpoint. Key limit remaining: $12.35 / $30.99.",
          source: "official-api"
        },
        endpoint: "/api/v1/credits",
        totalCreditsUsd: 120,
        totalUsageUsd: 47.25,
        keyLimitUsd: 30.9876,
        keyRemainingUsd: 12.3456,
        hasKeyLimitWindow: true
      },
      false
    );

    expect(output).toContain("Provider: OpenRouter");
    expect(output).toContain("Updated: 2026-03-09T10:00:00.000Z");
    expect(output).toContain("Endpoint: /api/v1/credits");
    expect(output).toContain("Total credits: $120.00");
    expect(output).toContain("Total usage: $47.25");
    expect(output).toContain("Key limit total: $30.99");
    expect(output).toContain("Key limit remaining: $12.35");
    expect(output).toContain("Per-key window: yes");
  });

  it("renders json output for all provider detail views", () => {
    const openAiOutput = formatOpenAiDetailsOutput(
      {
        snapshot: {
          provider: "openai-api",
          status: "error",
          title: "OpenAI API Balance",
          updatedAt: "2026-03-09T10:00:00.000Z",
          message: "OPENAI_API_KEY is not configured.",
          source: "official-api"
        },
        periodStart: "2026-03-01T00:00:00.000Z",
        periodEnd: "2026-03-09T10:00:00.000Z",
        periodTimezone: "UTC",
        budgetConfigured: false,
        organizationHeaderConfigured: false,
        endpoint: "/v1/organization/costs"
      },
      true
    );

    const codexOutput = formatCodexDetailsOutput(
      {
        snapshot: {
          provider: "openai-codex",
          status: "ok",
          title: "OpenAI Codex Limits",
          updatedAt: "2026-03-09T20:58:23.000Z",
          message: "Local Codex session limits",
          source: "local-codex-session"
        },
        codexHome: "/tmp/.codex",
        cachePath: "/tmp/.ai-cost/codex-cache.json",
        freshnessWindowHours: 12
      },
      true
    );

    const openRouterOutput = formatOpenRouterDetailsOutput(
      {
        snapshot: {
          provider: "openrouter",
          status: "ok",
          title: "OpenRouter Balance",
          updatedAt: "2026-03-09T10:00:00.000Z",
          message: "Official OpenRouter credits endpoint.",
          source: "official-api"
        },
        endpoint: "/api/v1/credits",
        hasKeyLimitWindow: false
      },
      true
    );

    const cursorOutput = formatCursorDetailsOutput(
      {
        snapshot: {
          provider: "cursor",
          status: "ok",
          title: "Cursor Limits",
          updatedAt: "2026-03-09T10:00:00.000Z",
          message: "Cursor dashboard billing usage.",
          source: "official-dashboard-api"
        },
        topModels: [],
        teamId: -1,
        sourceDashboard: "cursor.com/dashboard?tab=billing"
      },
      true
    );

    expect(JSON.parse(openAiOutput)).toMatchObject({
      provider: "openai-api",
      snapshot: { provider: "openai-api" },
      endpoint: "/v1/organization/costs"
    });
    expect(JSON.parse(codexOutput)).toMatchObject({
      provider: "openai-codex",
      snapshot: { provider: "openai-codex" },
      freshnessWindowHours: 12
    });
    expect(JSON.parse(openRouterOutput)).toMatchObject({
      provider: "openrouter",
      snapshot: { provider: "openrouter" },
      endpoint: "/api/v1/credits"
    });
    expect(JSON.parse(cursorOutput)).toMatchObject({
      provider: "cursor",
      snapshot: { provider: "cursor" },
      sourceDashboard: "cursor.com/dashboard?tab=billing"
    });
  });
});
