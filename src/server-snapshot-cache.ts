import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type {
  CliSnapshotUploadRequest,
  ProviderDetailCard,
  ProviderDetailEntry,
  ProviderId,
  ProviderSnapshot
} from "./types.js";
import type { ProviderRuntimeConfig } from "./providers/runtime-config.js";

const SERVER_SNAPSHOT_CACHE_FILENAME = "server-snapshot-cache.json";

export interface CachedProviderPayload {
  snapshot: ProviderSnapshot;
  detail: ProviderDetailCard;
  generatedAt: string;
  command: string;
  storedAt: string;
}

export interface CachedProviderEntry {
  lastObserved?: CachedProviderPayload;
  lastSuccessful?: CachedProviderPayload;
}

export interface ServerSnapshotCacheRecord {
  version: 1;
  updatedAt: string;
  providers: Partial<Record<ProviderId, CachedProviderEntry>>;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "openai-api" || value === "openai-codex" || value === "openrouter" || value === "cursor";
}

function isProviderStatus(value: unknown): value is ProviderSnapshot["status"] {
  return value === "ok" || value === "unsupported" || value === "error" || value === "unauthorized";
}

function isSnapshotSource(value: unknown): value is ProviderSnapshot["source"] {
  return (
    value === "official-api" ||
    value === "official-dashboard-api" ||
    value === "official-docs-status" ||
    value === "local-codex-session" ||
    value === "codex-cache" ||
    value === "cli-upload-cache"
  );
}

function isProviderSnapshot(value: unknown): value is ProviderSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<ProviderSnapshot>;
  return (
    isProviderId(snapshot.provider) &&
    isProviderStatus(snapshot.status) &&
    isNonEmptyString(snapshot.title) &&
    isNonEmptyString(snapshot.updatedAt) &&
    isNonEmptyString(snapshot.message) &&
    isSnapshotSource(snapshot.source)
  );
}

function isProviderDetailEntry(value: unknown): value is ProviderDetailEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<ProviderDetailEntry>;
  return isNonEmptyString(entry.label) && typeof entry.value === "string";
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
    card.entries.every((entry) => isProviderDetailEntry(entry))
  );
}

function isCachedProviderPayload(value: unknown): value is CachedProviderPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as Partial<CachedProviderPayload>;
  return (
    isProviderSnapshot(payload.snapshot) &&
    isProviderDetailCard(payload.detail) &&
    isNonEmptyString(payload.generatedAt) &&
    isNonEmptyString(payload.command) &&
    isNonEmptyString(payload.storedAt)
  );
}

function isCachedProviderEntry(value: unknown): value is CachedProviderEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<CachedProviderEntry>;
  return (
    (entry.lastObserved === undefined || isCachedProviderPayload(entry.lastObserved)) &&
    (entry.lastSuccessful === undefined || isCachedProviderPayload(entry.lastSuccessful))
  );
}

function isServerSnapshotCacheRecord(value: unknown): value is ServerSnapshotCacheRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<ServerSnapshotCacheRecord>;
  if (record.version !== 1 || !isNonEmptyString(record.updatedAt) || !record.providers || typeof record.providers !== "object") {
    return false;
  }

  return Object.entries(record.providers).every(([provider, entry]) => isProviderId(provider) && isCachedProviderEntry(entry));
}

function getAppDataDir(config: ProviderRuntimeConfig): string {
  return config.APP_DATA_DIR ?? path.join(homedir(), ".ai-cost");
}

export function getServerSnapshotCachePath(config: ProviderRuntimeConfig): string {
  return path.join(getAppDataDir(config), SERVER_SNAPSHOT_CACHE_FILENAME);
}

export async function readServerSnapshotCache(config: ProviderRuntimeConfig): Promise<ServerSnapshotCacheRecord | null> {
  try {
    const raw = await readFile(getServerSnapshotCachePath(config), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isServerSnapshotCacheRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeServerSnapshotCache(
  config: ProviderRuntimeConfig,
  payload: CliSnapshotUploadRequest,
  now: Date = new Date()
): Promise<ServerSnapshotCacheRecord> {
  const storedAt = now.toISOString();
  const cachePath = getServerSnapshotCachePath(config);
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  const existing = (await readServerSnapshotCache(config)) ?? {
    version: 1 as const,
    updatedAt: storedAt,
    providers: {}
  };
  const detailByProvider = new Map(payload.providerDetails.map((detail) => [detail.provider, detail]));
  const nextProviders: Partial<Record<ProviderId, CachedProviderEntry>> = { ...existing.providers };

  for (const snapshot of payload.providers) {
    const detail = detailByProvider.get(snapshot.provider);
    if (!detail) {
      continue;
    }

    const cachedPayload: CachedProviderPayload = {
      snapshot,
      detail,
      generatedAt: payload.generatedAt,
      command: payload.command,
      storedAt
    };
    const currentEntry = nextProviders[snapshot.provider] ?? {};
    nextProviders[snapshot.provider] =
      snapshot.status === "ok"
        ? {
            lastObserved: cachedPayload,
            lastSuccessful: cachedPayload
          }
        : {
            ...currentEntry,
            lastObserved: cachedPayload
          };
  }

  const record: ServerSnapshotCacheRecord = {
    version: 1,
    updatedAt: storedAt,
    providers: nextProviders
  };

  await mkdir(path.dirname(cachePath), { recursive: true });

  try {
    await writeFile(tempPath, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, cachePath);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // ignore temp cleanup failures
    }
    throw error;
  }

  return record;
}
