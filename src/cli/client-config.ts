import { homedir } from "node:os";
import path from "node:path";
import { getClientEnvPath } from "./credential-store.js";
import type { ProviderRuntimeConfig } from "../providers/runtime-config.js";
import { readEnvFile } from "../env-file.js";

export const CLI_APP_DIR = path.join(homedir(), ".ai-cost");
export const DEFAULT_CLIENT_ENV_PATH = path.join(CLI_APP_DIR, "config.env");
const DEFAULT_CODEX_HOME = path.join(homedir(), ".codex");
const DEFAULT_PROVIDER_TIMEOUT_MS = 10000;

export interface ClientProviderConfig extends ProviderRuntimeConfig {
  envFilePath: string;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalPath(value: string | undefined): string | undefined {
  const trimmed = normalizeOptionalString(value);
  if (!trimmed) {
    return undefined;
  }

  // Older CLI builds wrote JSON-escaped Windows paths into config.env.
  if (/^[A-Za-z]:\\\\/.test(trimmed)) {
    return trimmed.replace(/\\\\/g, "\\");
  }

  return trimmed;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function resolveClientEnvPath(envFilePath?: string): Promise<string> {
  return path.resolve(envFilePath ?? (await getClientEnvPath()) ?? DEFAULT_CLIENT_ENV_PATH);
}

export async function loadClientProviderConfig(envFilePath?: string): Promise<ClientProviderConfig> {
  const resolvedEnvPath = await resolveClientEnvPath(envFilePath);
  const env = await readEnvFile(resolvedEnvPath);

  return {
    envFilePath: resolvedEnvPath,
    OPENAI_API_KEY: normalizeOptionalString(env.OPENAI_API_KEY),
    OPENAI_ORG_ID: normalizeOptionalString(env.OPENAI_ORG_ID),
    OPENAI_MONTHLY_BUDGET_USD: parseOptionalNumber(env.OPENAI_MONTHLY_BUDGET_USD),
    OPENROUTER_API_KEY: normalizeOptionalString(env.OPENROUTER_API_KEY),
    CODEX_HOME: normalizeOptionalPath(env.CODEX_HOME) ?? DEFAULT_CODEX_HOME,
    APP_DATA_DIR: normalizeOptionalPath(env.APP_DATA_DIR) ?? CLI_APP_DIR,
    CURSOR_DASHBOARD_COOKIE: normalizeOptionalString(env.CURSOR_DASHBOARD_COOKIE),
    CURSOR_TEAM_ID: parseOptionalNumber(env.CURSOR_TEAM_ID) ?? -1,
    PROVIDER_TIMEOUT_MS: parseOptionalNumber(env.PROVIDER_TIMEOUT_MS) ?? DEFAULT_PROVIDER_TIMEOUT_MS
  };
}
