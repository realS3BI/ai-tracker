import type { ProviderSnapshot } from "../types.js";
import { fetchJsonWithTimeout } from "./http.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";

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

export interface OpenRouterDetails {
  snapshot: ProviderSnapshot;
  endpoint: "/api/v1/credits";
  totalCreditsUsd?: number;
  totalUsageUsd?: number;
  keyLimitUsd?: number;
  keyRemainingUsd?: number;
  hasKeyLimitWindow: boolean;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

export async function getOpenRouterDetails(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<OpenRouterDetails> {
  const updatedAt = now.toISOString();

  if (!config.OPENROUTER_API_KEY) {
    return {
      snapshot: {
        provider: "openrouter",
        status: "error",
        title: "OpenRouter Balance",
        updatedAt,
        message: "OPENROUTER_API_KEY is not configured.",
        source: "official-api"
      },
      endpoint: "/api/v1/credits",
      hasKeyLimitWindow: false
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
        snapshot: {
          provider: "openrouter",
          status: "unauthorized",
          title: "OpenRouter Balance",
          updatedAt,
          message: "OpenRouter API key is unauthorized.",
          source: "official-api"
        },
        endpoint: "/api/v1/credits",
        hasKeyLimitWindow: false
      };
    }

    if (!response.ok) {
      return {
        snapshot: {
          provider: "openrouter",
          status: "error",
          title: "OpenRouter Balance",
          updatedAt,
          message: `OpenRouter credits request failed (${response.status}).`,
          source: "official-api"
        },
        endpoint: "/api/v1/credits",
        hasKeyLimitWindow: false
      };
    }

    const payload = (await response.json()) as OpenRouterCreditsPayload;
    const totalCredits = asNumber(payload.data?.total_credits ?? payload.total_credits);
    const totalUsage = asNumber(payload.data?.total_usage ?? payload.total_usage) ?? 0;
    const keyLimit = asNumber(payload.data?.limit ?? payload.limit);
    const keyRemaining = asNumber(payload.data?.limit_remaining ?? payload.limit_remaining);
    const usedUsd = Number(totalUsage.toFixed(6));

    if (typeof totalCredits !== "number") {
      return {
        snapshot: {
          provider: "openrouter",
          status: "error",
          title: "OpenRouter Balance",
          updatedAt,
          message: "OpenRouter response did not include total_credits.",
          source: "official-api"
        },
        endpoint: "/api/v1/credits",
        totalUsageUsd: usedUsd,
        keyLimitUsd: keyLimit,
        keyRemainingUsd: keyRemaining,
        hasKeyLimitWindow: typeof keyLimit === "number" && typeof keyRemaining === "number"
      };
    }

    const limitUsd = Number(totalCredits.toFixed(6));
    const remainingUsd = Number((limitUsd - usedUsd).toFixed(6));
    const keyWindowInfo =
      typeof keyLimit === "number" && typeof keyRemaining === "number"
        ? ` Key limit remaining: $${keyRemaining.toFixed(2)} / $${keyLimit.toFixed(2)}.`
        : "";

    return {
      snapshot: {
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
      },
      endpoint: "/api/v1/credits",
      totalCreditsUsd: limitUsd,
      totalUsageUsd: usedUsd,
      keyLimitUsd: keyLimit,
      keyRemainingUsd: keyRemaining,
      hasKeyLimitWindow: typeof keyLimit === "number" && typeof keyRemaining === "number"
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      snapshot: {
        provider: "openrouter",
        status: "error",
        title: "OpenRouter Balance",
        updatedAt,
        message: `OpenRouter request error: ${reason}`,
        source: "official-api"
      },
      endpoint: "/api/v1/credits",
      hasKeyLimitWindow: false
    };
  }
}

export async function getOpenRouterSnapshot(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<ProviderSnapshot> {
  return (await getOpenRouterDetails(config, now)).snapshot;
}
