import type { AppConfig } from "../config.js";
import type { ProviderSnapshot } from "../types.js";
import { fetchJsonWithTimeout } from "./http.js";

interface OpenAICostBucket {
  amount?: {
    value?: number;
    currency?: string;
  };
  value?: number;
}

interface OpenAICostResponse {
  data?: OpenAICostBucket[];
}

function getMonthBoundsUtc(now: Date): { startTime: number; endTime: number; resetAt: string } {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0);
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0);
  return {
    startTime: Math.floor(start / 1000),
    endTime: Math.floor(now.getTime() / 1000),
    resetAt: new Date(nextMonth).toISOString()
  };
}

function sumCosts(response: OpenAICostResponse): number {
  if (!Array.isArray(response.data)) {
    return 0;
  }
  return response.data.reduce((total, entry) => {
    const amountValue =
      typeof entry.amount?.value === "number"
        ? entry.amount.value
        : typeof entry.value === "number"
          ? entry.value
          : 0;
    return total + amountValue;
  }, 0);
}

export async function getOpenAiApiSnapshot(
  config: AppConfig,
  now: Date = new Date()
): Promise<ProviderSnapshot> {
  const updatedAt = now.toISOString();

  if (!config.OPENAI_API_KEY) {
    return {
      provider: "openai-api",
      status: "error",
      title: "OpenAI API Balance",
      updatedAt,
      message: "OPENAI_API_KEY is not configured.",
      source: "official-api"
    };
  }

  if (typeof config.OPENAI_MONTHLY_BUDGET_USD !== "number") {
    return {
      provider: "openai-api",
      status: "error",
      title: "OpenAI API Balance",
      updatedAt,
      message: "OPENAI_MONTHLY_BUDGET_USD is not configured.",
      source: "official-api"
    };
  }

  const { startTime, endTime, resetAt } = getMonthBoundsUtc(now);
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
        provider: "openai-api",
        status: "unauthorized",
        title: "OpenAI API Balance",
        updatedAt,
        message: "OpenAI API key lacks access to organization costs.",
        source: "official-api"
      };
    }

    if (!response.ok) {
      return {
        provider: "openai-api",
        status: "error",
        title: "OpenAI API Balance",
        updatedAt,
        message: `OpenAI costs request failed (${response.status}).`,
        source: "official-api"
      };
    }

    const payload = (await response.json()) as OpenAICostResponse;
    const usedUsd = Number(sumCosts(payload).toFixed(6));
    const limitUsd = Number(config.OPENAI_MONTHLY_BUDGET_USD.toFixed(6));
    const remainingUsd = Number((limitUsd - usedUsd).toFixed(6));

    return {
      provider: "openai-api",
      status: "ok",
      title: "OpenAI API Balance",
      usedUsd,
      limitUsd,
      remainingUsd,
      unit: "usd",
      resetAt,
      updatedAt,
      message: "Monthly budget minus official OpenAI organization costs.",
      source: "official-api"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      provider: "openai-api",
      status: "error",
      title: "OpenAI API Balance",
      updatedAt,
      message: `OpenAI costs request error: ${reason}`,
      source: "official-api"
    };
  }
}
