import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { ProviderSnapshot } from "../types.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";

interface CodexRateWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface CodexRateLimits {
  limit_id?: string;
  limit_name?: string | null;
  primary?: CodexRateWindow;
  secondary?: CodexRateWindow;
  plan_type?: string | null;
}

interface CodexRateLimitEntry {
  timestamp: string;
  rateLimits: CodexRateLimits;
}

interface CodexCacheRecord {
  version: 1;
  provider: "openai-codex";
  updatedAt: string;
  cachedAt: string;
  remainingDisplay: string;
  usedDisplay: string;
  limitDisplay: string;
  resetAt?: string;
  secondaryResetAt?: string;
}

interface CodexSnapshotOptions {
  codexHome?: string;
  appDataDir?: string;
}

export interface CodexRateWindowDetails {
  usedPercent?: number;
  remainingPercent?: number;
  windowMinutes?: number;
  windowLabel: string;
  resetAt?: string;
}

export interface CodexDetails {
  snapshot: ProviderSnapshot;
  codexHome: string;
  cachePath: string;
  sourcePath?: string;
  selectedLimitId?: string;
  selectedLimitName?: string | null;
  planType?: string | null;
  freshnessWindowHours: number;
  primary?: CodexRateWindowDetails;
  secondary?: CodexRateWindowDetails;
}

const SESSION_FILES_TO_SCAN = 6;
const SESSION_TAIL_BYTES = 128 * 1024;
const CODEX_CACHE_FILENAME = "codex-cache.json";
const FRESHNESS_WINDOW_MS = 12 * 60 * 60 * 1000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getCodexHome(config: ProviderRuntimeConfig, options?: CodexSnapshotOptions): string {
  return options?.codexHome ?? config.CODEX_HOME ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex");
}

function getAppDataDir(config: ProviderRuntimeConfig, options?: CodexSnapshotOptions): string {
  return options?.appDataDir ?? config.APP_DATA_DIR ?? path.join(homedir(), ".ai-cost");
}

function getCodexCachePath(config: ProviderRuntimeConfig, options?: CodexSnapshotOptions): string {
  return path.join(getAppDataDir(config, options), CODEX_CACHE_FILENAME);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatWindowLabel(windowMinutes: number | undefined, fallback: string): string {
  if (!isFiniteNumber(windowMinutes) || windowMinutes <= 0) {
    return fallback;
  }
  if (windowMinutes % (60 * 24) === 0) {
    return `${windowMinutes / (60 * 24)}d`;
  }
  if (windowMinutes % 60 === 0) {
    return `${windowMinutes / 60}h`;
  }
  return `${windowMinutes}m`;
}

function formatReset(value: number | undefined): string | null {
  if (!isFiniteNumber(value) || value <= 0) {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function isFreshCodexEntry(entry: CodexRateLimitEntry, now: Date): boolean {
  const entryTime = Date.parse(entry.timestamp);
  if (!Number.isFinite(entryTime)) {
    return false;
  }
  return now.getTime() - entryTime <= FRESHNESS_WINDOW_MS;
}

function isCodexCacheRecord(value: unknown): value is CodexCacheRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<CodexCacheRecord>;
  return (
    record.version === 1 &&
    record.provider === "openai-codex" &&
    isNonEmptyString(record.updatedAt) &&
    isNonEmptyString(record.cachedAt) &&
    isNonEmptyString(record.remainingDisplay) &&
    isNonEmptyString(record.usedDisplay) &&
    isNonEmptyString(record.limitDisplay) &&
    (record.resetAt === undefined || isNonEmptyString(record.resetAt)) &&
    (record.secondaryResetAt === undefined || isNonEmptyString(record.secondaryResetAt))
  );
}

function createUnsupportedSnapshot(codexHome: string, now: Date): ProviderSnapshot {
  return {
    provider: "openai-codex",
    status: "unsupported",
    title: "OpenAI Codex Limits",
    updatedAt: now.toISOString(),
    message: `No current Codex rate-limit snapshot found in ${path.join(codexHome, "sessions")} and no fallback cache is available.`,
    source: "local-codex-session"
  };
}

function createLiveSnapshot(entry: CodexRateLimitEntry): ProviderSnapshot {
  const primaryUsed = isFiniteNumber(entry.rateLimits.primary?.used_percent) ? entry.rateLimits.primary.used_percent : 0;
  const secondaryUsed = isFiniteNumber(entry.rateLimits.secondary?.used_percent)
    ? entry.rateLimits.secondary.used_percent
    : 0;
  const primaryRemaining = Math.max(0, 100 - primaryUsed);
  const secondaryRemaining = Math.max(0, 100 - secondaryUsed);
  const primaryResetAt = formatReset(entry.rateLimits.primary?.resets_at);
  const secondaryResetAt = formatReset(entry.rateLimits.secondary?.resets_at);
  const primaryWindow = formatWindowLabel(entry.rateLimits.primary?.window_minutes, "primary");
  const secondaryWindow = formatWindowLabel(entry.rateLimits.secondary?.window_minutes, "secondary");

  return {
    provider: "openai-codex",
    status: "ok",
    title: "OpenAI Codex Limits",
    remainingDisplay: `${formatPercent(primaryRemaining)}/${formatPercent(secondaryRemaining)}`,
    usedDisplay: `${formatPercent(primaryUsed)}/${formatPercent(secondaryUsed)}`,
    limitDisplay: `${primaryWindow}/${secondaryWindow}`,
    updatedAt: entry.timestamp,
    resetAt: primaryResetAt ?? undefined,
    secondaryResetAt: secondaryResetAt ?? undefined,
    message: "Local Codex session limits",
    source: "local-codex-session"
  };
}

function createRateWindowDetails(window: CodexRateWindow | undefined, fallback: string): CodexRateWindowDetails | undefined {
  if (!window) {
    return undefined;
  }

  const usedPercent = isFiniteNumber(window.used_percent) ? window.used_percent : undefined;
  const remainingPercent = typeof usedPercent === "number" ? Math.max(0, 100 - usedPercent) : undefined;
  const windowMinutes = isFiniteNumber(window.window_minutes) ? window.window_minutes : undefined;
  const resetAt = formatReset(window.resets_at) ?? undefined;

  if (
    usedPercent === undefined &&
    remainingPercent === undefined &&
    windowMinutes === undefined &&
    resetAt === undefined
  ) {
    return undefined;
  }

  return {
    usedPercent,
    remainingPercent,
    windowMinutes,
    windowLabel: formatWindowLabel(windowMinutes, fallback),
    resetAt
  };
}

function isDifferentFromCache(snapshot: ProviderSnapshot, cache: CodexCacheRecord): boolean {
  return (
    snapshot.updatedAt !== cache.updatedAt ||
    snapshot.remainingDisplay !== cache.remainingDisplay ||
    snapshot.usedDisplay !== cache.usedDisplay ||
    snapshot.limitDisplay !== cache.limitDisplay ||
    snapshot.resetAt !== cache.resetAt ||
    snapshot.secondaryResetAt !== cache.secondaryResetAt
  );
}

function snapshotFromCache(cache: CodexCacheRecord): ProviderSnapshot {
  return {
    provider: "openai-codex",
    status: "ok",
    title: "OpenAI Codex Limits",
    remainingDisplay: cache.remainingDisplay,
    usedDisplay: cache.usedDisplay,
    limitDisplay: cache.limitDisplay,
    updatedAt: cache.updatedAt,
    resetAt: cache.resetAt,
    secondaryResetAt: cache.secondaryResetAt,
    message: "Using cached Codex limits from the persisted fallback cache.",
    source: "codex-cache"
  };
}

async function readCodexCache(
  config: ProviderRuntimeConfig,
  options?: CodexSnapshotOptions
): Promise<CodexCacheRecord | null> {
  try {
    const raw = await readFile(getCodexCachePath(config, options), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return isCodexCacheRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCodexCache(
  config: ProviderRuntimeConfig,
  snapshot: ProviderSnapshot,
  now: Date,
  options?: CodexSnapshotOptions
): Promise<void> {
  if (!snapshot.remainingDisplay || !snapshot.usedDisplay || !snapshot.limitDisplay) {
    return;
  }

  const cachePath = getCodexCachePath(config, options);
  const tempPath = `${cachePath}.${process.pid}.tmp`;
  const record: CodexCacheRecord = {
    version: 1,
    provider: "openai-codex",
    updatedAt: snapshot.updatedAt,
    cachedAt: now.toISOString(),
    remainingDisplay: snapshot.remainingDisplay,
    usedDisplay: snapshot.usedDisplay,
    limitDisplay: snapshot.limitDisplay,
    resetAt: snapshot.resetAt,
    secondaryResetAt: snapshot.secondaryResetAt
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
}

async function listNewestSessionFiles(sessionsRoot: string, limit: number): Promise<string[]> {
  const sessionFiles: string[] = [];
  const years = await readdir(sessionsRoot, { withFileTypes: true });

  for (const year of years.filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
    const yearPath = path.join(sessionsRoot, year.name);
    const months = await readdir(yearPath, { withFileTypes: true });

    for (const month of months.filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
      const monthPath = path.join(yearPath, month.name);
      const days = await readdir(monthPath, { withFileTypes: true });

      for (const day of days.filter((entry) => entry.isDirectory()).sort((a, b) => b.name.localeCompare(a.name))) {
        const dayPath = path.join(monthPath, day.name);
        const files = await readdir(dayPath, { withFileTypes: true });

        for (const file of files
          .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
          .sort((a, b) => b.name.localeCompare(a.name))) {
          sessionFiles.push(path.join(dayPath, file.name));
          if (sessionFiles.length >= limit) {
            return sessionFiles;
          }
        }
      }
    }
  }

  return sessionFiles;
}

async function readTailLines(filePath: string, maxBytes: number): Promise<string[]> {
  const handle = await open(filePath, "r");

  try {
    const stats = await handle.stat();
    if (stats.size === 0) {
      return [];
    }

    const bytesToRead = Math.min(stats.size, maxBytes);
    const buffer = Buffer.alloc(bytesToRead);
    await handle.read(buffer, 0, bytesToRead, stats.size - bytesToRead);

    const lines = buffer.toString("utf8").split(/\r?\n/);
    if (bytesToRead < stats.size) {
      lines.shift();
    }

    return lines.filter((line) => line.trim().length > 0);
  } finally {
    await handle.close();
  }
}

function parseRateLimitEntry(line: string): CodexRateLimitEntry | null {
  try {
    const parsed = JSON.parse(line) as {
      timestamp?: string;
      type?: string;
      payload?: {
        type?: string;
        rate_limits?: CodexRateLimits;
      };
    };

    if (parsed.type !== "event_msg" || parsed.payload?.type !== "token_count" || !parsed.payload.rate_limits) {
      return null;
    }

    return {
      timestamp: parsed.timestamp ?? new Date(0).toISOString(),
      rateLimits: parsed.payload.rate_limits
    };
  } catch {
    return null;
  }
}

async function getLatestRateLimitEntries(codexHome: string): Promise<{
  latestEntry: CodexRateLimitEntry | null;
  latestEntryPath?: string;
  accountEntry: CodexRateLimitEntry | null;
  accountEntryPath?: string;
}> {
  const sessionsRoot = path.join(codexHome, "sessions");
  const sessionFiles = await listNewestSessionFiles(sessionsRoot, SESSION_FILES_TO_SCAN);
  let latestEntry: CodexRateLimitEntry | null = null;
  let latestEntryPath: string | undefined;
  let accountEntry: CodexRateLimitEntry | null = null;
  let accountEntryPath: string | undefined;

  for (const filePath of sessionFiles) {
    const lines = await readTailLines(filePath, SESSION_TAIL_BYTES);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const entry = parseRateLimitEntry(lines[index]);
      if (!entry) {
        continue;
      }

      if (!latestEntry) {
        latestEntry = entry;
        latestEntryPath = filePath;
      }
      if (entry.rateLimits.limit_id === "codex") {
        if (!accountEntry) {
          accountEntry = entry;
          accountEntryPath = filePath;
        }
      }

      if (latestEntry && accountEntry) {
        return { latestEntry, latestEntryPath, accountEntry, accountEntryPath };
      }
    }
  }

  return { latestEntry, latestEntryPath, accountEntry, accountEntryPath };
}

export async function getCodexDetails(
  config: ProviderRuntimeConfig,
  now: Date = new Date(),
  options?: CodexSnapshotOptions
): Promise<CodexDetails> {
  const codexHome = getCodexHome(config, options);
  const cachePath = getCodexCachePath(config, options);
  const cache = await readCodexCache(config, options);
  let selectedEntry: CodexRateLimitEntry | null = null;
  let sourcePath: string | undefined;

  try {
    const { latestEntry, latestEntryPath, accountEntry, accountEntryPath } = await getLatestRateLimitEntries(codexHome);
    selectedEntry = accountEntry ?? latestEntry;
    sourcePath = accountEntry ? accountEntryPath : latestEntryPath;
  } catch {
    selectedEntry = null;
  }

  if (selectedEntry && isFreshCodexEntry(selectedEntry, now)) {
    const liveSnapshot = createLiveSnapshot(selectedEntry);

    if (!cache || isDifferentFromCache(liveSnapshot, cache)) {
      try {
        await writeCodexCache(config, liveSnapshot, now, options);
      } catch {
        // cache persistence is best-effort; live data still wins
      }
    }

    return {
      snapshot: liveSnapshot,
      codexHome,
      cachePath,
      sourcePath,
      selectedLimitId: selectedEntry.rateLimits.limit_id,
      selectedLimitName: selectedEntry.rateLimits.limit_name,
      planType: selectedEntry.rateLimits.plan_type,
      freshnessWindowHours: FRESHNESS_WINDOW_MS / (60 * 60 * 1000),
      primary: createRateWindowDetails(selectedEntry.rateLimits.primary, "primary"),
      secondary: createRateWindowDetails(selectedEntry.rateLimits.secondary, "secondary")
    };
  }

  if (cache) {
    return {
      snapshot: snapshotFromCache(cache),
      codexHome,
      cachePath,
      freshnessWindowHours: FRESHNESS_WINDOW_MS / (60 * 60 * 1000)
    };
  }

  return {
    snapshot: createUnsupportedSnapshot(codexHome, now),
    codexHome,
    cachePath,
    freshnessWindowHours: FRESHNESS_WINDOW_MS / (60 * 60 * 1000)
  };
}

export async function getCodexSnapshot(
  config: ProviderRuntimeConfig,
  now: Date = new Date(),
  options?: CodexSnapshotOptions
): Promise<ProviderSnapshot> {
  return (await getCodexDetails(config, now, options)).snapshot;
}
