import path from "node:path";
import type { AppConfig } from "./config.js";
import { readEnvFile, upsertEnvValue } from "./env-file.js";

export const SYNCABLE_ENV_KEYS = [
  "OPENAI_API_KEY",
  "OPENAI_ORG_ID",
  "OPENAI_MONTHLY_BUDGET_USD",
  "OPENROUTER_API_KEY",
  "CODEX_HOME",
  "CURSOR_DASHBOARD_COOKIE",
  "CURSOR_TEAM_ID",
  "PROVIDER_TIMEOUT_MS"
] as const;

export type SyncableEnvKey = (typeof SYNCABLE_ENV_KEYS)[number];
export type SyncableEnvValues = Record<SyncableEnvKey, string>;

const SYNCABLE_ENV_KEY_SET = new Set<string>(SYNCABLE_ENV_KEYS);

function stringifyOptionalValue(value: number | string | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }
  return value ?? "";
}

export function isSyncableEnvKey(value: string): value is SyncableEnvKey {
  return SYNCABLE_ENV_KEY_SET.has(value);
}

export function pickSyncableEnvValues(source: Partial<Record<string, string | undefined>>): SyncableEnvValues {
  return {
    OPENAI_API_KEY: source.OPENAI_API_KEY ?? "",
    OPENAI_ORG_ID: source.OPENAI_ORG_ID ?? "",
    OPENAI_MONTHLY_BUDGET_USD: source.OPENAI_MONTHLY_BUDGET_USD ?? "",
    OPENROUTER_API_KEY: source.OPENROUTER_API_KEY ?? "",
    CODEX_HOME: source.CODEX_HOME ?? "",
    CURSOR_DASHBOARD_COOKIE: source.CURSOR_DASHBOARD_COOKIE ?? "",
    CURSOR_TEAM_ID: source.CURSOR_TEAM_ID ?? "",
    PROVIDER_TIMEOUT_MS: source.PROVIDER_TIMEOUT_MS ?? ""
  };
}

export function getSyncableEnvFromConfig(config: AppConfig): SyncableEnvValues {
  return pickSyncableEnvValues({
    OPENAI_API_KEY: config.OPENAI_API_KEY,
    OPENAI_ORG_ID: config.OPENAI_ORG_ID,
    OPENAI_MONTHLY_BUDGET_USD: stringifyOptionalValue(config.OPENAI_MONTHLY_BUDGET_USD),
    OPENROUTER_API_KEY: config.OPENROUTER_API_KEY,
    CODEX_HOME: config.CODEX_HOME,
    CURSOR_DASHBOARD_COOKIE: config.CURSOR_DASHBOARD_COOKIE,
    CURSOR_TEAM_ID: stringifyOptionalValue(config.CURSOR_TEAM_ID),
    PROVIDER_TIMEOUT_MS: stringifyOptionalValue(config.PROVIDER_TIMEOUT_MS)
  });
}

export function resolveServerEnvSyncPath(config: AppConfig): string {
  return path.resolve(process.env.AI_COST_ENV_SYNC_PATH ?? path.join(config.APP_DATA_DIR ?? ".ai-cost", "config.env"));
}

export async function readServerSyncEnv(config: AppConfig): Promise<{ env: SyncableEnvValues; envFilePath: string }> {
  const envFilePath = resolveServerEnvSyncPath(config);
  const fileValues = await readEnvFile(envFilePath);
  const fallbackValues = getSyncableEnvFromConfig(config);
  const env = {} as SyncableEnvValues;

  for (const key of SYNCABLE_ENV_KEYS) {
    env[key] = Object.prototype.hasOwnProperty.call(fileValues, key) ? fileValues[key] ?? "" : fallbackValues[key];
  }

  return {
    env,
    envFilePath
  };
}

export async function writeServerSyncEnv(
  config: AppConfig,
  values: Partial<SyncableEnvValues>
): Promise<{ envFilePath: string }> {
  const envFilePath = resolveServerEnvSyncPath(config);

  for (const [key, value] of Object.entries(values)) {
    if (isSyncableEnvKey(key) && typeof value === "string") {
      await upsertEnvValue(envFilePath, key, value);
    }
  }

  return { envFilePath };
}
