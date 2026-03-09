import { homedir } from "node:os";
import path from "node:path";
import { open, readdir } from "node:fs/promises";
import type { AppConfig } from "../config.js";
import type { ProviderSnapshot } from "../types.js";

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

interface CodexSnapshotOptions {
  codexHome?: string;
}

const SESSION_FILES_TO_SCAN = 6;
const SESSION_TAIL_BYTES = 128 * 1024;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getCodexHome(config: AppConfig, options?: CodexSnapshotOptions): string {
  return options?.codexHome ?? config.CODEX_HOME ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex");
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
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
  accountEntry: CodexRateLimitEntry | null;
}> {
  const sessionsRoot = path.join(codexHome, "sessions");
  const sessionFiles = await listNewestSessionFiles(sessionsRoot, SESSION_FILES_TO_SCAN);
  let latestEntry: CodexRateLimitEntry | null = null;
  let accountEntry: CodexRateLimitEntry | null = null;

  for (const filePath of sessionFiles) {
    const lines = await readTailLines(filePath, SESSION_TAIL_BYTES);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const entry = parseRateLimitEntry(lines[index]);
      if (!entry) {
        continue;
      }

      latestEntry ??= entry;
      if (entry.rateLimits.limit_id === "codex") {
        accountEntry ??= entry;
      }

      if (latestEntry && accountEntry) {
        return { latestEntry, accountEntry };
      }
    }
  }

  return { latestEntry, accountEntry };
}

export async function getCodexSnapshot(
  config: AppConfig,
  now: Date = new Date(),
  options?: CodexSnapshotOptions
): Promise<ProviderSnapshot> {
  const updatedAt = now.toISOString();
  const codexHome = getCodexHome(config, options);

  try {
    const { latestEntry, accountEntry } = await getLatestRateLimitEntries(codexHome);
    const selectedEntry = accountEntry ?? latestEntry;

    if (!selectedEntry) {
      return {
        provider: "openai-codex",
        status: "unsupported",
        title: "OpenAI Codex Limits",
        updatedAt,
        message: `No local Codex rate-limit snapshot found in ${path.join(codexHome, "sessions")}.`,
        source: "local-codex-session"
      };
    }

    const primaryUsed = isFiniteNumber(selectedEntry.rateLimits.primary?.used_percent)
      ? selectedEntry.rateLimits.primary.used_percent
      : 0;
    const secondaryUsed = isFiniteNumber(selectedEntry.rateLimits.secondary?.used_percent)
      ? selectedEntry.rateLimits.secondary.used_percent
      : 0;
    const primaryRemaining = Math.max(0, 100 - primaryUsed);
    const secondaryRemaining = Math.max(0, 100 - secondaryUsed);
    const primaryResetAt = formatReset(selectedEntry.rateLimits.primary?.resets_at);
    const secondaryResetAt = formatReset(selectedEntry.rateLimits.secondary?.resets_at);
    const primaryWindow = formatWindowLabel(selectedEntry.rateLimits.primary?.window_minutes, "primary");
    const secondaryWindow = formatWindowLabel(selectedEntry.rateLimits.secondary?.window_minutes, "secondary");

    return {
      provider: "openai-codex",
      status: "ok",
      title: "OpenAI Codex Limits",
      remainingDisplay: `${formatPercent(primaryRemaining)} / ${formatPercent(secondaryRemaining)}`,
      usedDisplay: `${formatPercent(primaryUsed)} / ${formatPercent(secondaryUsed)}`,
      limitDisplay: `${primaryWindow} / ${secondaryWindow}`,
      updatedAt: selectedEntry.timestamp,
      resetAt: primaryResetAt ?? undefined,
      secondaryResetAt: secondaryResetAt ?? undefined,
      message: "Local Codex session limits",
      source: "local-codex-session"
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {
        provider: "openai-codex",
        status: "unsupported",
        title: "OpenAI Codex Limits",
        updatedAt,
        message: `No local Codex rate-limit snapshot found in ${path.join(codexHome, "sessions")}.`,
        source: "local-codex-session"
      };
    }

    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      provider: "openai-codex",
      status: "error",
      title: "OpenAI Codex Limits",
      updatedAt,
      message: `Unable to read local Codex rate-limit data: ${reason}`,
      source: "local-codex-session"
    };
  }
}
