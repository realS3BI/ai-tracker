import type { ProviderSnapshot } from "../types.js";
import { fetchJsonWithTimeout } from "./http.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";

interface CursorPlanUsage {
  includedSpend?: number | string;
  remaining?: number | string;
  limit?: number | string;
  autoPercentUsed?: number | string;
  apiPercentUsed?: number | string;
}

interface CursorCurrentPeriodResponse {
  billingCycleStart?: number | string;
  billingCycleEnd?: number | string;
  planUsage?: CursorPlanUsage;
}

interface CursorUsageAggregation {
  modelIntent?: string;
  inputTokens?: number | string;
  outputTokens?: number | string;
  cacheReadTokens?: number | string;
  totalCents?: number | string;
  tier?: number | string;
}

interface CursorAggregatedUsageResponse {
  aggregations?: CursorUsageAggregation[];
  totalInputTokens?: number | string;
  totalOutputTokens?: number | string;
  totalCacheReadTokens?: number | string;
  totalCostCents?: number | string;
}

export interface CursorUsageMix {
  autoPercentUsed?: number;
  apiPercentUsed?: number;
}

export interface CursorTopModel {
  modelIntent: string;
  totalUsd: number;
}

export interface CursorModelAggregation {
  modelIntent: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalUsd: number;
  tier?: number;
}

export interface CursorModelTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  totalUsd: number;
}

export interface CursorModelUsage {
  aggregations: CursorModelAggregation[];
  totals: CursorModelTotals;
}

export interface CursorDetails {
  snapshot: ProviderSnapshot;
  usageMix?: CursorUsageMix;
  topModels: CursorTopModel[];
  modelUsage?: CursorModelUsage;
  billingCycleStart?: string;
  billingCycleEnd?: string;
  teamId: number;
  sourceDashboard: "cursor.com/dashboard?tab=billing";
}

const CURSOR_DASHBOARD_HEADERS = {
  accept: "*/*",
  "content-type": "application/json",
  origin: "https://cursor.com",
  referer: "https://cursor.com/dashboard?tab=billing",
  "user-agent": "ai-cost-tracker/1.0"
} as const;

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function formatCookieHeader(cookie: string): string {
  const trimmed = cookie.trim();
  if (trimmed.includes("=")) {
    return trimmed;
  }
  return `WorkosCursorSessionToken=${trimmed}`;
}

function centsToUsd(value: number | undefined): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  return Number((value / 100).toFixed(6));
}

function toIso(value: number | undefined): string | undefined {
  if (typeof value !== "number" || value <= 0) {
    return undefined;
  }
  return new Date(value).toISOString();
}

function getTopModels(payload: CursorAggregatedUsageResponse): CursorTopModel[] {
  const modelUsage = getModelUsage(payload);
  if (!modelUsage) {
    return [];
  }

  return getTopModelsFromAggregations(modelUsage.aggregations);
}

function getTopModelsFromAggregations(aggregations: CursorModelAggregation[]): CursorTopModel[] {
  if (aggregations.length === 0) {
    return [];
  }

  return aggregations
    .filter((aggregation) => aggregation.totalUsd > 0)
    .map((aggregation) => ({
      modelIntent: aggregation.modelIntent,
      totalUsd: aggregation.totalUsd
    }))
    .sort((left, right) => right.totalUsd - left.totalUsd)
    .slice(0, 2);
}

function getModelUsage(payload: CursorAggregatedUsageResponse): CursorModelUsage | undefined {
  if (!Array.isArray(payload.aggregations) || payload.aggregations.length === 0) {
    return undefined;
  }

  const aggregations = payload.aggregations
    .map((aggregation) => ({
      modelIntent: aggregation.modelIntent?.trim() || "unknown",
      inputTokens: Math.round(asNumber(aggregation.inputTokens) ?? 0),
      outputTokens: Math.round(asNumber(aggregation.outputTokens) ?? 0),
      cacheReadTokens: Math.round(asNumber(aggregation.cacheReadTokens) ?? 0),
      tier: asNumber(aggregation.tier),
      totalUsd: Number(((asNumber(aggregation.totalCents) ?? 0) / 100).toFixed(6))
    }))
    .sort((left, right) => right.totalUsd - left.totalUsd);

  if (aggregations.length === 0) {
    return undefined;
  }

  return {
    aggregations,
    totals: {
      inputTokens:
        Math.round(asNumber(payload.totalInputTokens) ?? aggregations.reduce((sum, aggregation) => sum + aggregation.inputTokens, 0)),
      outputTokens:
        Math.round(
          asNumber(payload.totalOutputTokens) ?? aggregations.reduce((sum, aggregation) => sum + aggregation.outputTokens, 0)
        ),
      cacheReadTokens:
        Math.round(
          asNumber(payload.totalCacheReadTokens) ?? aggregations.reduce((sum, aggregation) => sum + aggregation.cacheReadTokens, 0)
        ),
      totalUsd: Number(
        (
          (asNumber(payload.totalCostCents) ?? aggregations.reduce((sum, aggregation) => sum + aggregation.totalUsd * 100, 0)) / 100
        ).toFixed(6)
      )
    }
  };
}

function formatTopModels(topModels: CursorTopModel[]): string {
  if (topModels.length === 0) {
    return "";
  }

  return ` Top models: ${topModels.map((aggregation) => `${aggregation.modelIntent} $${aggregation.totalUsd.toFixed(2)}`).join(", ")}.`;
}

export async function getCursorDetails(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<CursorDetails> {
  const updatedAt = now.toISOString();
  const sourceDashboard = "cursor.com/dashboard?tab=billing";

  if (!config.CURSOR_DASHBOARD_COOKIE) {
    return {
      snapshot: {
        provider: "cursor",
        status: "error",
        title: "Cursor Limits",
        updatedAt,
        message: "CURSOR_DASHBOARD_COOKIE is not configured.",
        source: "official-dashboard-api"
      },
      topModels: [],
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard
    };
  }

  const cookieHeader = formatCookieHeader(config.CURSOR_DASHBOARD_COOKIE);

  try {
    const currentResponse = await fetchJsonWithTimeout(
      "https://cursor.com/api/dashboard/get-current-period-usage",
      {
        method: "POST",
        redirect: "manual",
        headers: {
          ...CURSOR_DASHBOARD_HEADERS,
          cookie: cookieHeader
        },
        body: JSON.stringify({})
      },
      config.PROVIDER_TIMEOUT_MS
    );

    if (currentResponse.status === 307 || currentResponse.status === 401 || currentResponse.status === 403) {
      return {
        snapshot: {
          provider: "cursor",
          status: "unauthorized",
          title: "Cursor Limits",
          updatedAt,
        message: "Cursor dashboard session is unauthorized or expired.",
        source: "official-dashboard-api"
      },
      topModels: [],
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard
    };
  }

    if (!currentResponse.ok) {
      return {
        snapshot: {
          provider: "cursor",
          status: "error",
          title: "Cursor Limits",
          updatedAt,
        message: `Cursor current-period request failed (${currentResponse.status}).`,
        source: "official-dashboard-api"
      },
      topModels: [],
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard
    };
  }

    const currentPayload = (await currentResponse.json()) as CursorCurrentPeriodResponse;
    const billingCycleStart = asNumber(currentPayload.billingCycleStart);
    const billingCycleEnd = asNumber(currentPayload.billingCycleEnd);
    const includedSpendCents = asNumber(currentPayload.planUsage?.includedSpend);
    const remainingCents = asNumber(currentPayload.planUsage?.remaining);
    const limitCents = asNumber(currentPayload.planUsage?.limit);

    if (
      typeof billingCycleStart !== "number" ||
      typeof billingCycleEnd !== "number" ||
      typeof includedSpendCents !== "number" ||
      typeof remainingCents !== "number" ||
      typeof limitCents !== "number"
    ) {
      return {
        snapshot: {
          provider: "cursor",
          status: "error",
          title: "Cursor Limits",
          updatedAt,
          message: "Cursor current-period response is missing billing usage fields.",
          source: "official-dashboard-api"
        },
        topModels: [],
        teamId: config.CURSOR_TEAM_ID,
        sourceDashboard
      };
    }

    let topModels: CursorTopModel[] = [];
    let modelUsage: CursorModelUsage | undefined;
    const aggregatedResponse = await fetchJsonWithTimeout(
      "https://cursor.com/api/dashboard/get-aggregated-usage-events",
      {
        method: "POST",
        redirect: "manual",
        headers: {
          ...CURSOR_DASHBOARD_HEADERS,
          cookie: cookieHeader
        },
        body: JSON.stringify({
          teamId: config.CURSOR_TEAM_ID,
          startDate: billingCycleStart
        })
      },
      config.PROVIDER_TIMEOUT_MS
    );

    if (aggregatedResponse.ok) {
      const aggregatedPayload = (await aggregatedResponse.json()) as CursorAggregatedUsageResponse;
      modelUsage = getModelUsage(aggregatedPayload);
      topModels = getTopModels(aggregatedPayload);
    }

    const autoPercentUsed = asNumber(currentPayload.planUsage?.autoPercentUsed);
    const apiPercentUsed = asNumber(currentPayload.planUsage?.apiPercentUsed);
    const usageMix =
      typeof autoPercentUsed === "number" || typeof apiPercentUsed === "number"
        ? {
            autoPercentUsed,
            apiPercentUsed
          }
        : undefined;

    return {
      billingCycleStart: toIso(billingCycleStart),
      billingCycleEnd: toIso(billingCycleEnd),
      usageMix,
      topModels,
      modelUsage,
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard,
      snapshot: {
        provider: "cursor",
        status: "ok",
        title: "Cursor Limits",
        usedUsd: centsToUsd(includedSpendCents),
        remainingUsd: centsToUsd(remainingCents),
        limitUsd: centsToUsd(limitCents),
        unit: "usd",
        updatedAt,
        resetAt: toIso(billingCycleEnd),
        message: `Cursor dashboard billing usage.${formatTopModels(topModels)}`.trim(),
        source: "official-dashboard-api"
      }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      snapshot: {
        provider: "cursor",
        status: "error",
        title: "Cursor Limits",
        updatedAt,
        message: `Cursor dashboard request error: ${reason}`,
        source: "official-dashboard-api"
      },
      topModels: [],
      teamId: config.CURSOR_TEAM_ID,
      sourceDashboard
    };
  }
}

export async function getCursorSnapshot(
  config: ProviderRuntimeConfig,
  now: Date = new Date()
): Promise<ProviderSnapshot> {
  const details = await getCursorDetails(config, now);
  return details.snapshot;
}
