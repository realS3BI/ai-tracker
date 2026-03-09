import type { AppConfig } from "../config.js";
import type { ProviderSnapshot } from "../types.js";
import { fetchJsonWithTimeout } from "./http.js";

interface OpenRouterCreditsPayload {
  data?: {
    total_credits?: number;
    total_usage?: number;
    limit?: number;
    limit_remaining?: number;
  };
  total_credits?: number;
  total_usage?: number;
  limit?: number;
  limit_remaining?: number;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export async function getOpenRouterSnapshot(
  config: AppConfig,
  now: Date = new Date()
): Promise<ProviderSnapshot> {
  const updatedAt = now.toISOString();

  if (!config.OPENROUTER_API_KEY) {
    return {
      provider: "openrouter",
      status: "error",
      title: "OpenRouter Balance",
      updatedAt,
      message: "OPENROUTER_API_KEY is not configured.",
      source: "official-api"
    };
  }

  try {
    const response = await fetchJsonWithTimeout(
      "https://openrouter.ai/api/v1/credits",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`
        }
      },
      config.PROVIDER_TIMEOUT_MS
    );

    if (response.status === 401 || response.status === 403) {
      return {
        provider: "openrouter",
        status: "unauthorized",
        title: "OpenRouter Balance",
        updatedAt,
        message: "OpenRouter API key is unauthorized.",
        source: "official-api"
      };
    }

    if (!response.ok) {
      return {
        provider: "openrouter",
        status: "error",
        title: "OpenRouter Balance",
        updatedAt,
        message: `OpenRouter credits request failed (${response.status}).`,
        source: "official-api"
      };
    }

    const payload = (await response.json()) as OpenRouterCreditsPayload;
    const totalCredits = asNumber(payload.data?.total_credits ?? payload.total_credits);
    const totalUsage = asNumber(payload.data?.total_usage ?? payload.total_usage) ?? 0;
    const keyLimit = asNumber(payload.data?.limit ?? payload.limit);
    const keyRemaining = asNumber(payload.data?.limit_remaining ?? payload.limit_remaining);

    if (typeof totalCredits !== "number") {
      return {
        provider: "openrouter",
        status: "error",
        title: "OpenRouter Balance",
        updatedAt,
        message: "OpenRouter response did not include total_credits.",
        source: "official-api"
      };
    }

    const limitUsd = Number(totalCredits.toFixed(6));
    const usedUsd = Number(totalUsage.toFixed(6));
    const remainingUsd = Number((limitUsd - usedUsd).toFixed(6));
    const keyWindowInfo =
      typeof keyLimit === "number" && typeof keyRemaining === "number"
        ? ` Key limit remaining: $${keyRemaining.toFixed(4)} / $${keyLimit.toFixed(4)}.`
        : "";

    return {
      provider: "openrouter",
      status: "ok",
      title: "OpenRouter Balance",
      limitUsd,
      usedUsd,
      remainingUsd,
      unit: "usd",
      updatedAt,
      message: `Official OpenRouter credits endpoint.${keyWindowInfo}`,
      source: "official-api"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      provider: "openrouter",
      status: "error",
      title: "OpenRouter Balance",
      updatedAt,
      message: `OpenRouter request error: ${reason}`,
      source: "official-api"
    };
  }
}
