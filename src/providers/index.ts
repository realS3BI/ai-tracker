import type { ProviderSnapshot, SnapshotResponse } from "../types.js";
import { getCodexDetails, type CodexDetails } from "./codex.js";
import { getCursorDetails, type CursorDetails } from "./cursor.js";
import { getOpenAiApiDetails, type OpenAiApiDetails } from "./openaiApi.js";
import { getOpenRouterDetails, type OpenRouterDetails } from "./openrouter.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";

export type ProviderDetails = CodexDetails | OpenAiApiDetails | OpenRouterDetails | CursorDetails;
export type ProviderDetailsTuple = [CodexDetails, OpenAiApiDetails, OpenRouterDetails, CursorDetails];

async function safeProviderCall<T extends { snapshot: ProviderSnapshot }>(
  provider: Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await provider;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      ...fallback,
      snapshot: {
        ...fallback.snapshot,
        message: `Provider exception: ${reason}`
      }
    };
  }
}

export async function getProviderDetails(config: ProviderRuntimeConfig, now: Date = new Date()): Promise<ProviderDetailsTuple> {
  const timestamp = now.toISOString();

  const [codex, openaiApi, openrouter, cursor] = await Promise.all([
    safeProviderCall(getCodexDetails(config, now), {
      snapshot: {
        provider: "openai-codex",
        status: "error",
        title: "OpenAI Codex Limits",
        updatedAt: timestamp,
        message: "Unable to fetch provider snapshot.",
        source: "local-codex-session"
      },
      codexHome: config.CODEX_HOME ?? "",
      cachePath: "",
      freshnessWindowHours: 12
    }),
    safeProviderCall(getOpenAiApiDetails(config, now), {
      snapshot: {
        provider: "openai-api",
        status: "error",
        title: "OpenAI API Balance",
        updatedAt: timestamp,
        message: "Unable to fetch provider snapshot.",
        source: "official-api"
      },
      periodStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)).toISOString(),
      periodEnd: timestamp,
      periodTimezone: "UTC",
      budgetConfigured: typeof config.OPENAI_MONTHLY_BUDGET_USD === "number",
      organizationHeaderConfigured: Boolean(config.OPENAI_ORG_ID),
      endpoint: "/v1/organization/costs"
    }),
    safeProviderCall(getOpenRouterDetails(config, now), {
      snapshot: {
        provider: "openrouter",
        status: "error",
        title: "OpenRouter Balance",
        updatedAt: timestamp,
        message: "Unable to fetch provider snapshot.",
        source: "official-api"
      },
      endpoint: "/api/v1/credits",
      hasKeyLimitWindow: false
    }),
    safeProviderCall(getCursorDetails(config, now), {
      snapshot: {
        provider: "cursor",
        status: "error",
        title: "Cursor Limits",
        updatedAt: timestamp,
        message: "Unable to fetch provider snapshot.",
        source: "official-dashboard-api"
      },
      topModels: [],
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard: "cursor.com/dashboard?tab=billing"
    })
  ]);

  return [codex, openaiApi, openrouter, cursor];
}

export async function getSnapshot(config: ProviderRuntimeConfig, now: Date = new Date()): Promise<SnapshotResponse> {
  const details = await getProviderDetails(config, now);
  return {
    generatedAt: now.toISOString(),
    providers: details.map((provider) => provider.snapshot)
  };
}
