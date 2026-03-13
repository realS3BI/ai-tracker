#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import prompts from "prompts";
import { extractCursorSessionToken } from "./cli/cursor-cookie.js";
import { DEFAULT_CLIENT_ENV_PATH, loadClientProviderConfig, resolveClientEnvPath } from "./cli/client-config.js";
import {
  clearStoredToken,
  getBackendUrl,
  getClientEnvPath,
  getStoredToken,
  setBackendUrl,
  setClientEnvPath,
  setStoredToken
} from "./cli/credential-store.js";
import type { SyncableEnvValues } from "./env-sync.js";
import { upsertEnvValue } from "./env-file.js";
import { getCodexDetails } from "./providers/codex.js";
import { getCursorDetails } from "./providers/cursor.js";
import { getOpenAiApiDetails } from "./providers/openaiApi.js";
import { getOpenRouterDetails } from "./providers/openrouter.js";
import {
  createCodexDetailCard,
  createCursorDetailCard,
  createOpenAiDetailCard,
  createOpenRouterDetailCard,
  formatCodexDetailsOutput,
  formatCursorDetailsOutput,
  formatOpenAiDetailsOutput,
  formatOpenRouterDetailsOutput
} from "./provider-detail-view.js";
import { renderTable } from "./snapshot-view.js";
import type { ClientProviderConfig } from "./cli/client-config.js";
import type {
  CliEnvSyncResponse,
  CliJsonOutput,
  CliSnapshotUploadRequest,
  ProviderDetailCard,
  ProviderId,
  ProviderSnapshot,
  SnapshotResponse
} from "./types.js";

export { renderTable } from "./snapshot-view.js";
export {
  formatCodexDetailsOutput,
  formatCursorDetailsOutput,
  formatOpenAiDetailsOutput,
  formatOpenRouterDetailsOutput
} from "./provider-detail-view.js";

const DEFAULT_BACKEND_URL = "http://localhost:3000";
const PROVIDER_ORDER: ProviderId[] = ["openai-codex", "openai-api", "openrouter", "cursor"];
const PROMPT_ABORT_EXIT_CODE = 130;

export class PromptAbortedError extends Error {
  constructor() {
    super("Prompt aborted.");
    this.name = "PromptAbortedError";
  }
}

interface CliOptions {
  command: "show" | "login" | "logout" | "cursor" | "codex" | "openai" | "openrouter" | "cursor-cookie" | "init" | "help";
  json: boolean;
  models: boolean;
  url?: string;
  value?: string;
  envFile?: string;
  stdout: boolean;
}

interface LocalProviderBundle {
  codex: Awaited<ReturnType<typeof getCodexDetails>>;
  openaiApi?: Awaited<ReturnType<typeof getOpenAiApiDetails>>;
  openrouter?: Awaited<ReturnType<typeof getOpenRouterDetails>>;
  cursor?: Awaited<ReturnType<typeof getCursorDetails>>;
  providers: ProviderSnapshot[];
  providerDetails: ProviderDetailCard[];
}

export async function promptOrAbort<T extends string>(
  questions: prompts.PromptObject<T> | Array<prompts.PromptObject<T>>
): Promise<prompts.Answers<T>> {
  return prompts<T>(questions, {
    onCancel: () => {
      throw new PromptAbortedError();
    }
  });
}

export function getCliExitCode(error: unknown): number {
  return error instanceof PromptAbortedError ? PROMPT_ABORT_EXIT_CODE : 1;
}

export function parseArgs(argv: string[]): CliOptions {
  let command: CliOptions["command"] = "show";
  let json = false;
  let models = false;
  let url: string | undefined;
  let value: string | undefined;
  let envFile: string | undefined;
  let stdout = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (
      arg === "login" ||
      arg === "logout" ||
      arg === "cursor" ||
      arg === "codex" ||
      arg === "openai" ||
      arg === "openrouter" ||
      arg === "cursor-cookie" ||
      arg === "init" ||
      arg === "help" ||
      arg === "--help" ||
      arg === "-h"
    ) {
      command = arg === "--help" || arg === "-h" ? "help" : arg;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--models") {
      models = true;
      continue;
    }

    if (arg === "--url") {
      url = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--value") {
      value = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--env-path") {
      envFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--stdout") {
      stdout = true;
      continue;
    }
  }

  return { command, json, models, url, value, envFile, stdout };
}

function ensureBackendUrl(input: string): string {
  const normalized = input.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  return parsed.toString().replace(/\/+$/, "");
}

function formatOutputWithNotices(output: string, jsonOutput: boolean, notices: string[]): string {
  if (notices.length === 0) {
    return output;
  }

  if (jsonOutput) {
    const parsed = JSON.parse(output) as CliJsonOutput | Record<string, unknown>;
    return JSON.stringify({ ...parsed, notices }, null, 2);
  }

  return [output, ...notices].join("\n");
}

export function formatSnapshotOutput(snapshot: SnapshotResponse, jsonOutput: boolean, notices: string[] = []): string {
  const output = jsonOutput ? JSON.stringify(snapshot, null, 2) : renderTable(snapshot);
  return formatOutputWithNotices(output, jsonOutput, notices);
}

export function printHelp(): void {
  console.log("Usage:");
  console.log("  ai-cost                Show snapshot");
  console.log("  ai-cost --json         Show raw JSON snapshot");
  console.log("  ai-cost init           Configure backend URL and local provider settings");
  console.log("  ai-cost login          Login and store API token");
  console.log("  ai-cost logout         Remove stored API token");
  console.log("  ai-cost cursor         Show detailed local Cursor billing data");
  console.log("  ai-cost cursor --models  Show Cursor billing data with per-model table");
  console.log("  ai-cost codex          Show detailed local Codex rate-limit data");
  console.log("  ai-cost openai         Show detailed OpenAI API billing data");
  console.log("  ai-cost openrouter     Show detailed OpenRouter credits data");
  console.log("  ai-cost cursor-cookie  Extract Cursor session cookie and write .env");
  console.log("Options:");
  console.log("  --url <backend-url>    Override backend URL");
  console.log("  --value <text>         Cookie header, curl command, or raw token");
  console.log(`  --env-path <path>      Target env file (default: ${DEFAULT_CLIENT_ENV_PATH} for init/show)`);
  console.log("  --models               Show per-model Cursor aggregation table");
  console.log("  --stdout               Print extracted token instead of writing file");
  console.log("Examples:");
  console.log("  ai-cost init --url https://ai-cost.example.com");
  console.log("  ai-cost login --url https://ai-cost.example.com");
  console.log("  ai-cost cursor-cookie --value \"WorkosCursorSessionToken=...\"");
  console.log("  Get-Clipboard | ai-cost cursor-cookie");
}

async function requestCliToken(backendUrl: string, password: string): Promise<string> {
  const response = await fetch(`${backendUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      password,
      issueCliToken: true
    })
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status}).`);
  }

  const payload = (await response.json()) as { token?: string };
  if (!payload.token) {
    throw new Error("Login response did not include a token.");
  }

  return payload.token;
}

async function fetchRemoteEnv(backendUrl: string, token: string): Promise<SyncableEnvValues> {
  const response = await fetch(`${backendUrl}/api/cli/env`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new Error("Token rejected. Run `ai-cost login` again.");
  }

  if (!response.ok) {
    throw new Error(`Env download failed (${response.status}).`);
  }

  const payload = (await response.json()) as CliEnvSyncResponse;
  return payload.env as SyncableEnvValues;
}

async function runLogin(urlOption?: string): Promise<void> {
  const existingUrl = await getBackendUrl();
  const initialUrl = urlOption ?? existingUrl ?? DEFAULT_BACKEND_URL;

  const answers = await promptOrAbort(
    [
      {
        type: "text",
        name: "backendUrl",
        message: "Backend URL",
        initial: initialUrl
      },
      {
        type: "password",
        name: "password",
        message: "Password"
      }
    ]
  );

  if (!answers.backendUrl || !answers.password) {
    throw new Error("Login aborted.");
  }

  const backendUrl = ensureBackendUrl(answers.backendUrl);
  const token = await requestCliToken(backendUrl, answers.password);

  await setBackendUrl(backendUrl);
  await setStoredToken(token);
  console.log(`Login successful. Backend: ${backendUrl}`);
}

async function runLogout(): Promise<void> {
  await clearStoredToken();
  console.log("Stored CLI token removed.");
}

async function fetchRemoteSnapshot(backendUrl: string, token: string): Promise<SnapshotResponse> {
  const response = await fetch(`${backendUrl}/api/snapshot`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new Error("Token rejected. Run `ai-cost login` again.");
  }

  if (!response.ok) {
    throw new Error(`Snapshot request failed (${response.status}).`);
  }

  return (await response.json()) as SnapshotResponse;
}

async function uploadCliSnapshotCache(
  backendUrl: string,
  token: string,
  payload: CliSnapshotUploadRequest
): Promise<void> {
  const response = await fetch(`${backendUrl}/api/cli/cache/snapshot`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (response.status === 401) {
    throw new Error("Token rejected. Run `ai-cost login` again.");
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.trim().length > 0) {
        detail = body.message;
      }
    } catch {
      // ignore non-JSON error responses and keep the status-based fallback
    }

    throw new Error(detail ? `Cache upload failed (${response.status}): ${detail}` : `Cache upload failed (${response.status}).`);
  }
}

function createMissingProviderSnapshot(provider: ProviderId, updatedAt: string, message: string): ProviderSnapshot {
  switch (provider) {
    case "openai-codex":
      return {
        provider,
        status: "error",
        title: "OpenAI Codex Limits",
        updatedAt,
        message,
        source: "local-codex-session"
      };
    case "openai-api":
      return {
        provider,
        status: "error",
        title: "OpenAI API Balance",
        updatedAt,
        message,
        source: "official-api"
      };
    case "openrouter":
      return {
        provider,
        status: "error",
        title: "OpenRouter Balance",
        updatedAt,
        message,
        source: "official-api"
      };
    case "cursor":
      return {
        provider,
        status: "error",
        title: "Cursor Limits",
        updatedAt,
        message,
        source: "official-dashboard-api"
      };
  }
}

function hasLocalOpenAiConfig(config: ClientProviderConfig): boolean {
  return Boolean(config.OPENAI_API_KEY || config.OPENAI_ORG_ID || typeof config.OPENAI_MONTHLY_BUDGET_USD === "number");
}

function createLocalProviderCards(bundle: {
  codex: Awaited<ReturnType<typeof getCodexDetails>>;
  openaiApi?: Awaited<ReturnType<typeof getOpenAiApiDetails>>;
  openrouter?: Awaited<ReturnType<typeof getOpenRouterDetails>>;
  cursor?: Awaited<ReturnType<typeof getCursorDetails>>;
}): ProviderDetailCard[] {
  const cards: ProviderDetailCard[] = [createCodexDetailCard(bundle.codex)];

  if (bundle.openaiApi) {
    cards.push(createOpenAiDetailCard(bundle.openaiApi));
  }

  if (bundle.openrouter) {
    cards.push(createOpenRouterDetailCard(bundle.openrouter));
  }

  if (bundle.cursor) {
    cards.push(createCursorDetailCard(bundle.cursor));
  }

  return cards;
}

async function getLocalProviderBundle(config: ClientProviderConfig, now: Date): Promise<LocalProviderBundle> {
  const [codex, cursor, openaiApi, openrouter] = await Promise.all([
    getCodexDetails(config, now),
    config.CURSOR_DASHBOARD_COOKIE ? getCursorDetails(config, now) : Promise.resolve(undefined),
    hasLocalOpenAiConfig(config) ? getOpenAiApiDetails(config, now) : Promise.resolve(undefined),
    config.OPENROUTER_API_KEY ? getOpenRouterDetails(config, now) : Promise.resolve(undefined)
  ]);

  const providers: ProviderSnapshot[] = [codex.snapshot];
  if (openaiApi) {
    providers.push(openaiApi.snapshot);
  }
  if (openrouter) {
    providers.push(openrouter.snapshot);
  }
  if (cursor) {
    providers.push(cursor.snapshot);
  }

  return {
    codex,
    openaiApi,
    openrouter,
    cursor,
    providers,
    providerDetails: createLocalProviderCards({
      codex,
      openaiApi,
      openrouter,
      cursor
    })
  };
}

function createSyncPayload(command: string, bundle: LocalProviderBundle, now: Date): CliSnapshotUploadRequest {
  return {
    generatedAt: now.toISOString(),
    command,
    providers: bundle.providers,
    providerDetails: bundle.providerDetails
  };
}

async function syncLocalProviderCache(
  command: string,
  backendUrl: string,
  token: string | null,
  bundle: LocalProviderBundle,
  now: Date
): Promise<string | undefined> {
  if (!token) {
    return undefined;
  }

  try {
    await uploadCliSnapshotCache(backendUrl, token, createSyncPayload(command, bundle, now));
    return undefined;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown sync error.";
    return `Sync notice: ${reason}`;
  }
}

export function mergeProviderSnapshots(
  remoteSnapshot: SnapshotResponse | null,
  localProviders: ProviderSnapshot[],
  generatedAt: string,
  remoteError?: string
): SnapshotResponse {
  const remoteProviders = new Map(remoteSnapshot?.providers.map((provider) => [provider.provider, provider]) ?? []);
  const localProviderMap = new Map(localProviders.map((provider) => [provider.provider, provider]));
  const fallbackMessage =
    remoteError ?? "Backend snapshot unavailable. Run `ai-cost init` / `ai-cost login` or configure local credentials.";

  return {
    generatedAt: remoteSnapshot?.generatedAt ?? generatedAt,
    providers: PROVIDER_ORDER.map(
      (provider) => localProviderMap.get(provider) ?? remoteProviders.get(provider) ?? createMissingProviderSnapshot(provider, generatedAt, fallbackMessage)
    )
  };
}

function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.message === "fetch failed") {
      return true;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "ECONNRESET" || code === "ETIMEDOUT") {
      return true;
    }
    if (error.cause instanceof Error) {
      return isConnectionError(error.cause);
    }
  }
  return false;
}

function normalizeCursorCookieValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return extractCursorSessionToken(trimmed) ?? trimmed;
}

function preferRemoteDefault(localValue: string | number | undefined, remoteValue: string | undefined): string {
  const normalizedLocal = typeof localValue === "number" ? String(localValue) : localValue;
  const trimmedLocal = normalizedLocal?.trim();
  if (trimmedLocal) {
    return trimmedLocal;
  }

  return remoteValue?.trim() ?? "";
}

async function runInit(urlOption?: string, envFileOption?: string): Promise<void> {
  const existingUrl = await getBackendUrl();
  const initialEnvPath = await resolveClientEnvPath(envFileOption ?? (await getClientEnvPath()) ?? undefined);

  const setupAnswers = await promptOrAbort(
    [
      {
        type: "text",
        name: "backendUrl",
        message: "Backend URL",
        initial: urlOption ?? existingUrl ?? DEFAULT_BACKEND_URL
      },
      {
        type: "text",
        name: "envFilePath",
        message: "Local env file",
        initial: initialEnvPath
      },
      {
        type: "password",
        name: "backendPassword",
        message: "Backend password (optional, blank skips login)"
      }
    ]
  );

  if (!setupAnswers.backendUrl || !setupAnswers.envFilePath) {
    throw new Error("Init aborted.");
  }

  const backendUrl = ensureBackendUrl(setupAnswers.backendUrl);
  const envFilePath = path.resolve(setupAnswers.envFilePath);
  const currentConfig = await loadClientProviderConfig(envFilePath);
  const backendPassword = setupAnswers.backendPassword?.trim();
  let token: string | null = null;
  let remoteEnv: SyncableEnvValues | null = null;
  let remoteEnvError: string | null = null;

  if (backendPassword) {
    try {
      token = await requestCliToken(backendUrl, backendPassword);
      try {
        remoteEnv = await fetchRemoteEnv(backendUrl, token);
      } catch (error) {
        remoteEnvError = error instanceof Error ? error.message : "Failed to load server env defaults.";
      }
    } catch (error) {
      if (isConnectionError(error)) {
        remoteEnvError = `Could not reach the backend at ${backendUrl}. Is the server running? Continuing without login.`;
        console.warn(`ai-cost: ${remoteEnvError}`);
      } else {
        throw error;
      }
    }
  }

  const answers = await promptOrAbort(
    [
      {
        type: "text",
        name: "codexHome",
        message: "Local CODEX_HOME",
        initial: currentConfig.CODEX_HOME
      },
      {
        type: "text",
        name: "appDataDir",
        message: "Local APP_DATA_DIR",
        initial: currentConfig.APP_DATA_DIR
      },
      {
        type: "text",
        name: "cursorCookie",
        message: "Cursor cookie/token (optional)",
        initial: preferRemoteDefault(currentConfig.CURSOR_DASHBOARD_COOKIE, remoteEnv?.CURSOR_DASHBOARD_COOKIE)
      },
      {
        type: "text",
        name: "cursorTeamId",
        message: "Cursor team ID",
        initial: preferRemoteDefault(currentConfig.CURSOR_TEAM_ID, remoteEnv?.CURSOR_TEAM_ID) || "-1"
      },
      {
        type: "text",
        name: "openaiApiKey",
        message: "OPENAI_API_KEY (optional)",
        initial: preferRemoteDefault(currentConfig.OPENAI_API_KEY, remoteEnv?.OPENAI_API_KEY)
      },
      {
        type: "text",
        name: "openaiOrgId",
        message: "OPENAI_ORG_ID (optional)",
        initial: preferRemoteDefault(currentConfig.OPENAI_ORG_ID, remoteEnv?.OPENAI_ORG_ID)
      },
      {
        type: "text",
        name: "openaiBudgetUsd",
        message: "OPENAI_MONTHLY_BUDGET_USD (optional)",
        initial: preferRemoteDefault(currentConfig.OPENAI_MONTHLY_BUDGET_USD, remoteEnv?.OPENAI_MONTHLY_BUDGET_USD)
      },
      {
        type: "text",
        name: "openrouterApiKey",
        message: "OPENROUTER_API_KEY (optional)",
        initial: preferRemoteDefault(currentConfig.OPENROUTER_API_KEY, remoteEnv?.OPENROUTER_API_KEY)
      },
      {
        type: "text",
        name: "providerTimeoutMs",
        message: "PROVIDER_TIMEOUT_MS",
        initial: preferRemoteDefault(currentConfig.PROVIDER_TIMEOUT_MS, remoteEnv?.PROVIDER_TIMEOUT_MS) || "10000"
      }
    ]
  );

  await setBackendUrl(backendUrl);
  await setClientEnvPath(envFilePath);

  await upsertEnvValue(envFilePath, "CODEX_HOME", answers.codexHome?.trim() || "");
  await upsertEnvValue(envFilePath, "APP_DATA_DIR", answers.appDataDir?.trim() || "");
  await upsertEnvValue(envFilePath, "CURSOR_DASHBOARD_COOKIE", normalizeCursorCookieValue(answers.cursorCookie ?? ""));
  await upsertEnvValue(envFilePath, "CURSOR_TEAM_ID", answers.cursorTeamId?.trim() || "-1");
  await upsertEnvValue(envFilePath, "OPENAI_API_KEY", answers.openaiApiKey?.trim() || "");
  await upsertEnvValue(envFilePath, "OPENAI_ORG_ID", answers.openaiOrgId?.trim() || "");
  await upsertEnvValue(envFilePath, "OPENAI_MONTHLY_BUDGET_USD", answers.openaiBudgetUsd?.trim() || "");
  await upsertEnvValue(envFilePath, "OPENROUTER_API_KEY", answers.openrouterApiKey?.trim() || "");
  await upsertEnvValue(envFilePath, "PROVIDER_TIMEOUT_MS", answers.providerTimeoutMs?.trim() || "10000");

  if (token) {
    await setStoredToken(token);
    if (remoteEnvError) {
      console.log(`Saved local CLI config to ${envFilePath} and refreshed backend token. Server env defaults could not be loaded: ${remoteEnvError}`);
      return;
    }
    console.log(`Saved local CLI config to ${envFilePath} and refreshed backend token.`);
    return;
  }

  console.log(`Saved local CLI config to ${envFilePath}. Run 'ai-cost login' if you still need a backend token.`);
}

async function runShow(jsonOutput: boolean, urlOption?: string, envFileOption?: string): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localBundle = await getLocalProviderBundle(localConfig, now);
  const backendUrl = ensureBackendUrl(urlOption ?? (await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  let remoteSnapshot: SnapshotResponse | null = null;
  let remoteError: string | undefined;
  let remoteNotice: string | undefined;

  if (token) {
    try {
      remoteSnapshot = await fetchRemoteSnapshot(backendUrl, token);
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "Backend snapshot unavailable.";
      remoteNotice = `Server notice: ${remoteError}`;
    }
  } else {
    remoteError = "No CLI token found. Run `ai-cost init` / `ai-cost login` or configure local credentials.";
  }

  const syncNotice = await syncLocalProviderCache("show", backendUrl, token, localBundle, now);
  const snapshot = mergeProviderSnapshots(remoteSnapshot, localBundle.providers, now.toISOString(), remoteError);
  console.log(formatSnapshotOutput(snapshot, jsonOutput, [remoteNotice, syncNotice].filter((value): value is string => Boolean(value))));
}

async function runCursor(jsonOutput: boolean, envFileOption?: string, showModels = false): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localBundle = await getLocalProviderBundle(localConfig, now);
  const backendUrl = ensureBackendUrl((await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  const syncNotice = await syncLocalProviderCache(showModels ? "cursor --models" : "cursor", backendUrl, token, localBundle, now);
  const details = localBundle.cursor ?? (await getCursorDetails(localConfig, now));
  console.log(formatOutputWithNotices(formatCursorDetailsOutput(details, jsonOutput, showModels), jsonOutput, [syncNotice].filter((value): value is string => Boolean(value))));
}

async function runCodex(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localBundle = await getLocalProviderBundle(localConfig, now);
  const backendUrl = ensureBackendUrl((await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  const syncNotice = await syncLocalProviderCache("codex", backendUrl, token, localBundle, now);
  console.log(formatOutputWithNotices(formatCodexDetailsOutput(localBundle.codex, jsonOutput), jsonOutput, [syncNotice].filter((value): value is string => Boolean(value))));
}

async function runOpenAi(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localBundle = await getLocalProviderBundle(localConfig, now);
  const backendUrl = ensureBackendUrl((await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  const syncNotice = await syncLocalProviderCache("openai", backendUrl, token, localBundle, now);
  const details = localBundle.openaiApi ?? (await getOpenAiApiDetails(localConfig, now));
  console.log(formatOutputWithNotices(formatOpenAiDetailsOutput(details, jsonOutput), jsonOutput, [syncNotice].filter((value): value is string => Boolean(value))));
}

async function runOpenRouter(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localBundle = await getLocalProviderBundle(localConfig, now);
  const backendUrl = ensureBackendUrl((await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  const syncNotice = await syncLocalProviderCache("openrouter", backendUrl, token, localBundle, now);
  const details = localBundle.openrouter ?? (await getOpenRouterDetails(localConfig, now));
  console.log(formatOutputWithNotices(formatOpenRouterDetailsOutput(details, jsonOutput), jsonOutput, [syncNotice].filter((value): value is string => Boolean(value))));
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function getCursorCookieInput(valueOption?: string): Promise<string> {
  if (valueOption?.trim()) {
    return valueOption;
  }

  if (!process.stdin.isTTY) {
    const stdinValue = await readStdin();
    if (stdinValue.trim()) {
      return stdinValue;
    }
  }

  const answer = await promptOrAbort(
    {
      type: "text",
      name: "value",
      message: "Paste Cursor cookie header, curl command, or WorkosCursorSessionToken"
    }
  );

  if (!answer.value) {
    throw new Error("Cursor cookie input aborted.");
  }

  return answer.value;
}

async function runCursorCookie(valueOption?: string, envFileOption?: string, stdout = false): Promise<void> {
  const input = await getCursorCookieInput(valueOption);
  const token = extractCursorSessionToken(input);

  if (!token) {
    throw new Error("Could not find WorkosCursorSessionToken in the provided input.");
  }

  if (stdout) {
    console.log(token);
    return;
  }

  const envFilePath = path.resolve(envFileOption ?? (await resolveClientEnvPath()));
  await upsertEnvValue(envFilePath, "CURSOR_DASHBOARD_COOKIE", token);
  console.log(`Saved CURSOR_DASHBOARD_COOKIE to ${envFilePath}`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  switch (options.command) {
    case "help":
      printHelp();
      return;
    case "init":
      await runInit(options.url, options.envFile);
      return;
    case "login":
      await runLogin(options.url);
      return;
    case "logout":
      await runLogout();
      return;
    case "cursor":
      await runCursor(options.json, options.envFile, options.models);
      return;
    case "codex":
      await runCodex(options.json, options.envFile);
      return;
    case "openai":
      await runOpenAi(options.json, options.envFile);
      return;
    case "openrouter":
      await runOpenRouter(options.json, options.envFile);
      return;
    case "cursor-cookie":
      await runCursorCookie(options.value, options.envFile, options.stdout);
      return;
    case "show":
      await runShow(options.json, options.url, options.envFile);
      return;
    default:
      printHelp();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    if (error instanceof PromptAbortedError) {
      process.exit(getCliExitCode(error));
    }

    const message = error instanceof Error ? error.message : "Unknown CLI error";
    console.error(`ai-cost: ${message}`);
    process.exit(getCliExitCode(error));
  });
}
