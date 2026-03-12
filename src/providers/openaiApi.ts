import type { ProviderSnapshot } from "../types.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";
import { fetchJsonWithTimeout } from "./http.js";

interface OpenAICostResult {
  amount?: {
    value?: number;
    currency?: string;
  };
  value?: number;
}

interface OpenAICostBucket extends OpenAICostResult {
  results?: OpenAICostResult[];
}

interface OpenAICostResponse {
  data?: OpenAICostBucket[];
}

export interface OpenAiApiDetails {
  snapshot: ProviderSnapshot;
  periodStart: string;
  periodEnd: string;
  periodTimezone: "UTC";
  budgetUsd?: number;
  budgetConfigured: boolean;
  organizationHeaderConfigured: boolean;
  endpoint: "/v1/organization/costs";
}

function getMonthBoundsUtc(now: Date): { startTime: number; endTime: number; periodStart: string; periodEnd: string; resetAt: string } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return {
    startTime: Math.floor(start / 1000),
    endTime: Math.floor(now.getTime() / 1000),
    periodStart: new Date(start).toISOString(),
    periodEnd: now.toISOString(),
    resetAt: new Date(nextMonth).toISOString()
  };
}

function sumCosts(response: OpenAICostResponse): number {
  if (!Array.isArray(response.data)) {
    return 0;
  }

  const getAmountValue = (entry: OpenAICostResult): number => {
    if (typeof entry.amount?.value === "number") {
      return entry.amount.value;
    }

    if (typeof entry.value === "number") {
      return entry.value;
    }

    return 0;
  };

  return response.data.reduce((total, entry) => {
    if (Array.isArray(entry.results)) {
      return total + entry.results.reduce((bucketTotal, result) => bucketTotal + getAmountValue(result), 0);
    }

    return total + getAmountValue(entry);
  }, 0);
}

export async function getOpenAiApiDetails(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<OpenAiApiDetails> {
  const updatedAt = now.toISOString();
  const { startTime, endTime, periodStart, periodEnd, resetAt } = getMonthBoundsUtc(now);
  const configuredBudgetUsd = config.OPENAI_MONTHLY_BUDGET_USD;
  const budgetConfigured = typeof configuredBudgetUsd === "number";
  const organizationHeaderConfigured = Boolean(config.OPENAI_ORG_ID);
  const budgetUsd = budgetConfigured ? Number(configuredBudgetUsd.toFixed(6)) : undefined;

  if (!config.OPENAI_API_KEY) {
    return {
      snapshot: {
        provider: "openai-api",
        status: "error",
        title: "OpenAI API Balance",
        updatedAt,
        message: "OPENAI_API_KEY is not configured.",
        source: "official-api"
      },
      periodStart,
      periodEnd,
      periodTimezone: "UTC",
      budgetUsd,
      budgetConfigured,
      organizationHeaderConfigured,
      endpoint: "/v1/organization/costs"
    };
  }

  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.OPENAI_API_KEY}`
  };

  if (config.OPENAI_ORG_ID) {
    headers["OpenAI-Organization"] = config.OPENAI_ORG_ID;
  }

  try {
    const response = await fetchJsonWithTimeout(
      url.toString(),
      {
        method: "GET",
        headers
      },
      config.PROVIDER_TIMEOUT_MS
    );

    if (response.status === 401 || response.status === 403) {
      return {
        snapshot: {
          provider: "openai-api",
          status: "unauthorized",
          title: "OpenAI API Balance",
          updatedAt,
          message: "Unauthorized.",
          source: "official-api"
        },
        periodStart,
        periodEnd,
        periodTimezone: "UTC",
        budgetUsd,
        budgetConfigured,
        organizationHeaderConfigured,
        endpoint: "/v1/organization/costs"
      };
    }

    if (!response.ok) {
      return {
        snapshot: {
          provider: "openai-api",
          status: "error",
          title: "OpenAI API Balance",
          updatedAt,
          message: `OpenAI costs request failed (${response.status}).`,
          source: "official-api"
        },
        periodStart,
        periodEnd,
        periodTimezone: "UTC",
        budgetUsd,
        budgetConfigured,
        organizationHeaderConfigured,
        endpoint: "/v1/organization/costs"
      };
    }

    const payload = (await response.json()) as OpenAICostResponse;
    const usedUsd = Number(sumCosts(payload).toFixed(6));
    const snapshot =
      typeof budgetUsd === "number"
        ? {
            provider: "openai-api" as const,
            status: "ok" as const,
            title: "OpenAI API Balance",
            usedUsd,
            limitUsd: budgetUsd,
            remainingUsd: Number((budgetUsd - usedUsd).toFixed(6)),
            unit: "usd" as const,
            resetAt,
            updatedAt,
            message: "Monthly budget minus official OpenAI organization costs.",
            source: "official-api" as const
          }
        : {
            provider: "openai-api" as const,
            status: "ok" as const,
            title: "OpenAI API Balance",
            usedUsd,
            unit: "usd" as const,
            updatedAt,
            message: "Official OpenAI organization costs for the current month.",
            source: "official-api" as const
          };

    return {
      snapshot,
      periodStart,
      periodEnd,
      periodTimezone: "UTC",
      budgetUsd,
      budgetConfigured,
      organizationHeaderConfigured,
      endpoint: "/v1/organization/costs"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      snapshot: {
        provider: "openai-api",
        status: "error",
        title: "OpenAI API Balance",
        updatedAt,
        message: `OpenAI costs request error: ${reason}`,
        source: "official-api"
      },
      periodStart,
      periodEnd,
      periodTimezone: "UTC",
      budgetUsd,
      budgetConfigured,
      organizationHeaderConfigured,
      endpoint: "/v1/organization/costs"
    };
  }
}

export async function getOpenAiApiSnapshot(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<ProviderSnapshot> {
  return (await getOpenAiApiDetails(config, now)).snapshot;
}
