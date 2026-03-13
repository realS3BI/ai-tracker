import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { isAuthorizedRequest, sendUnauthorized } from "../auth/session.js";
import {
  createCodexDetailCard,
  createCursorDetailCard,
  createOpenAiDetailCard,
  createOpenRouterDetailCard
} from "../provider-detail-view.js";
import { getProviderDetails } from "../providers/index.js";
import { snapshotSummaryCards, snapshotTableHeaders, snapshotTableRows } from "../snapshot-view.js";
import { readServerSnapshotCache, writeServerSnapshotCache, type CachedProviderPayload } from "../server-snapshot-cache.js";
import type { CliSnapshotUploadRequest, ProviderDetailCard, ProviderId, ProviderSnapshot } from "../types.js";

const PROVIDER_ORDER: ProviderId[] = ["openai-codex", "openai-api", "openrouter", "cursor"];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "openai-codex" || value === "openai-api" || value === "openrouter" || value === "cursor";
}

function isProviderSnapshot(value: unknown): value is ProviderSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ProviderSnapshot>;
  return (
    isProviderId(snapshot.provider) &&
    isNonEmptyString(snapshot.title) &&
    isNonEmptyString(snapshot.updatedAt) &&
    isNonEmptyString(snapshot.message) &&
    typeof snapshot.status === "string" &&
    typeof snapshot.source === "string"
  );
}

function isProviderDetailCard(value: unknown): value is ProviderDetailCard {
  if (!value || typeof value !== "object") {
    return false;
  }

  const card = value as Partial<ProviderDetailCard>;
  return (
    isProviderId(card.provider) &&
    isNonEmptyString(card.title) &&
    isNonEmptyString(card.status) &&
    Array.isArray(card.entries) &&
    card.entries.every((entry) => {
      return entry && typeof entry === "object" && isNonEmptyString((entry as { label?: unknown }).label) && typeof (entry as { value?: unknown }).value === "string";
    })
  );
}

function isCliSnapshotUploadRequest(value: unknown): value is CliSnapshotUploadRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<CliSnapshotUploadRequest>;
  return (
    isNonEmptyString(payload.generatedAt) &&
    isNonEmptyString(payload.command) &&
    Array.isArray(payload.providers) &&
    payload.providers.every((provider) => isProviderSnapshot(provider)) &&
    Array.isArray(payload.providerDetails) &&
    payload.providerDetails.every((detail) => isProviderDetailCard(detail))
  );
}

function withCacheSource(snapshot: ProviderSnapshot): ProviderSnapshot {
  return {
    ...snapshot,
    source: "cli-upload-cache"
  };
}

function withCachedCard(detail: ProviderDetailCard, snapshot: ProviderSnapshot): ProviderDetailCard {
  return {
    ...detail,
    status: snapshot.status === "ok" ? "ok (cached)" : `${snapshot.status} (cached)`,
    entries: detail.entries.map((entry) => {
      if (entry.label === "Status") {
        return {
          ...entry,
          value: snapshot.status === "ok" ? "ok (cached)" : `${snapshot.status} (cached)`
        };
      }

      if (entry.label === "Source") {
        return {
          ...entry,
          value: "cli-upload-cache"
        };
      }

      return entry;
    })
  };
}

function preferLiveSnapshot(
  liveSnapshot: ProviderSnapshot,
  liveCard: ProviderDetailCard,
  cachedProvider: { lastSuccessful?: CachedProviderPayload; lastObserved?: CachedProviderPayload } | undefined
): { snapshot: ProviderSnapshot; detail: ProviderDetailCard } {
  if (liveSnapshot.status === "ok") {
    return {
      snapshot: liveSnapshot,
      detail: liveCard
    };
  }

  const cached = cachedProvider?.lastSuccessful ?? cachedProvider?.lastObserved;
  if (!cached) {
    return {
      snapshot: liveSnapshot,
      detail: liveCard
    };
  }

  const snapshot = withCacheSource(cached.snapshot);
  return {
    snapshot,
    detail: withCachedCard(cached.detail, snapshot)
  };
}

export async function registerSnapshotRoutes(
  app: FastifyInstance,
  config: AppConfig
): Promise<void> {
  app.post("/api/cli/cache/snapshot", async (request, reply) => {
    if (!isAuthorizedRequest(request, config)) {
      sendUnauthorized(reply);
      return;
    }

    if (!isCliSnapshotUploadRequest(request.body)) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "Invalid snapshot upload payload."
      });
    }

    const stored = await writeServerSnapshotCache(config, request.body, new Date());
    return reply.send({
      ok: true,
      storedAt: stored.updatedAt,
      providersStored: request.body.providers.length
    });
  });

  app.get("/api/snapshot", async (request, reply) => {
    if (!isAuthorizedRequest(request, config)) {
      sendUnauthorized(reply);
      return;
    }

    const now = new Date();
    const details = await getProviderDetails(config, now);
    const cache = await readServerSnapshotCache(config);
    const liveCards = [
      createCodexDetailCard(details[0]),
      createOpenAiDetailCard(details[1]),
      createOpenRouterDetailCard(details[2]),
      createCursorDetailCard(details[3])
    ];
    const resolvedProviders = PROVIDER_ORDER.map((providerId, index) => {
      return preferLiveSnapshot(details[index].snapshot, liveCards[index], cache?.providers[providerId]);
    });
    const snapshot = {
      generatedAt: now.toISOString(),
      providers: resolvedProviders.map((provider) => provider.snapshot)
    };

    return reply.send({
      ...snapshot,
      summaryCards: snapshotSummaryCards(snapshot),
      headers: snapshotTableHeaders(),
      rows: snapshotTableRows(snapshot),
      providerDetails: resolvedProviders.map((provider) => provider.detail)
    });
  });
}
