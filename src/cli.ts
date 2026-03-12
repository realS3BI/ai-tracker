#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import prompts from "prompts";
import type { SnapshotResponse } from "./types.js";
import { extractCursorSessionToken, upsertEnvValue } from "./cli/cursor-cookie.js";
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
import { getCodexDetails, getCodexSnapshot } from "./providers/codex.js";
import { getCursorDetails, getCursorSnapshot } from "./providers/cursor.js";
import { getOpenAiApiDetails, getOpenAiApiSnapshot } from "./providers/openaiApi.js";
import { getOpenRouterDetails, getOpenRouterSnapshot } from "./providers/openrouter.js";
import {
  formatCodexDetailsOutput,
  formatCursorDetailsOutput,
  formatOpenAiDetailsOutput,
  formatOpenRouterDetailsOutput
} from "./provider-detail-view.js";
import { renderTable } from "./snapshot-view.js";
import type { ClientProviderConfig } from "./cli/client-config.js";
import type { ProviderId, ProviderSnapshot } from "./types.js";

export { renderTable } from "./snapshot-view.js";
export {
  formatCodexDetailsOutput,
  formatCursorDetailsOutput,
  formatOpenAiDetailsOutput,
  formatOpenRouterDetailsOutput
} from "./provider-detail-view.js";

const DEFAULT_BACKEND_URL = "http://localhost:3000";
const PROVIDER_ORDER: ProviderId[] = ["openai-codex", "openai-api", "openrouter", "cursor"];

interface CliOptions {
  command: "show" | "login" | "logout" | "cursor" | "codex" | "openai" | "openrouter" | "cursor-cookie" | "init" | "help";
  json: boolean;
  models: boolean;
  url?: string;
  value?: string;
  envFile?: string;
  stdout: boolean;
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

export function formatSnapshotOutput(snapshot: SnapshotResponse, jsonOutput: boolean): string {
  if (jsonOutput) {
    return JSON.stringify(snapshot, null, 2);
  }
  return renderTable(snapshot);
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

async function runLogin(urlOption?: string): Promise<void> {
  const existingUrl = await getBackendUrl();
  const initialUrl = urlOption ?? existingUrl ?? DEFAULT_BACKEND_URL;

  const answers = await prompts(
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
    ],
    {
      onCancel: () => {
        process.exitCode = 1;
        return true;
      }
    }
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

async function getLocalProviderSnapshots(config: ClientProviderConfig, now: Date): Promise<ProviderSnapshot[]> {
  const providers: Promise<ProviderSnapshot>[] = [getCodexSnapshot(config, now)];

  if (config.CURSOR_DASHBOARD_COOKIE) {
    providers.push(getCursorSnapshot(config, now));
  }

  if (hasLocalOpenAiConfig(config)) {
    providers.push(getOpenAiApiSnapshot(config, now));
  }

  if (config.OPENROUTER_API_KEY) {
    providers.push(getOpenRouterSnapshot(config, now));
  }

  return await Promise.all(providers);
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

function normalizeCursorCookieValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return extractCursorSessionToken(trimmed) ?? trimmed;
}

async function runInit(urlOption?: string, envFileOption?: string): Promise<void> {
  const existingUrl = await getBackendUrl();
  const initialEnvPath = await resolveClientEnvPath(envFileOption ?? (await getClientEnvPath()) ?? undefined);
  const currentConfig = await loadClientProviderConfig(initialEnvPath);

  const answers = await prompts(
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
      },
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
        initial: currentConfig.CURSOR_DASHBOARD_COOKIE ?? ""
      },
      {
        type: "text",
        name: "cursorTeamId",
        message: "Cursor team ID",
        initial: String(currentConfig.CURSOR_TEAM_ID)
      },
      {
        type: "text",
        name: "openaiApiKey",
        message: "OPENAI_API_KEY (optional)",
        initial: currentConfig.OPENAI_API_KEY ?? ""
      },
      {
        type: "text",
        name: "openaiOrgId",
        message: "OPENAI_ORG_ID (optional)",
        initial: currentConfig.OPENAI_ORG_ID ?? ""
      },
      {
        type: "text",
        name: "openaiBudgetUsd",
        message: "OPENAI_MONTHLY_BUDGET_USD (optional)",
        initial:
          typeof currentConfig.OPENAI_MONTHLY_BUDGET_USD === "number"
            ? String(currentConfig.OPENAI_MONTHLY_BUDGET_USD)
            : ""
      },
      {
        type: "text",
        name: "openrouterApiKey",
        message: "OPENROUTER_API_KEY (optional)",
        initial: currentConfig.OPENROUTER_API_KEY ?? ""
      },
      {
        type: "text",
        name: "providerTimeoutMs",
        message: "PROVIDER_TIMEOUT_MS",
        initial: String(currentConfig.PROVIDER_TIMEOUT_MS)
      }
    ],
    {
      onCancel: () => {
        process.exitCode = 1;
        return true;
      }
    }
  );

  if (!answers.backendUrl || !answers.envFilePath) {
    throw new Error("Init aborted.");
  }

  const backendUrl = ensureBackendUrl(answers.backendUrl);
  const envFilePath = path.resolve(answers.envFilePath);
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

  if (answers.backendPassword?.trim()) {
    const token = await requestCliToken(backendUrl, answers.backendPassword);
    await setStoredToken(token);
    console.log(`Saved local CLI config to ${envFilePath} and refreshed backend token.`);
    return;
  }

  console.log(`Saved local CLI config to ${envFilePath}. Run 'ai-cost login' if you still need a backend token.`);
}

async function runShow(jsonOutput: boolean, urlOption?: string, envFileOption?: string): Promise<void> {
  const now = new Date();
  const localConfig = await loadClientProviderConfig(envFileOption);
  const localProviders = await getLocalProviderSnapshots(localConfig, now);
  const backendUrl = ensureBackendUrl(urlOption ?? (await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();
  let remoteSnapshot: SnapshotResponse | null = null;
  let remoteError: string | undefined;

  if (token) {
    try {
      remoteSnapshot = await fetchRemoteSnapshot(backendUrl, token);
    } catch (error) {
      remoteError = error instanceof Error ? error.message : "Backend snapshot unavailable.";
    }
  } else {
    remoteError = "No CLI token found. Run `ai-cost init` / `ai-cost login` or configure local credentials.";
  }

  const snapshot = mergeProviderSnapshots(remoteSnapshot, localProviders, now.toISOString(), remoteError);
  console.log(formatSnapshotOutput(snapshot, jsonOutput));
}

async function runCursor(jsonOutput: boolean, envFileOption?: string, showModels = false): Promise<void> {
  const localConfig = await loadClientProviderConfig(envFileOption);
  const details = await getCursorDetails(localConfig, new Date());
  console.log(formatCursorDetailsOutput(details, jsonOutput, showModels));
}

async function runCodex(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const localConfig = await loadClientProviderConfig(envFileOption);
  const details = await getCodexDetails(localConfig, new Date());
  console.log(formatCodexDetailsOutput(details, jsonOutput));
}

async function runOpenAi(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const localConfig = await loadClientProviderConfig(envFileOption);
  const details = await getOpenAiApiDetails(localConfig, new Date());
  console.log(formatOpenAiDetailsOutput(details, jsonOutput));
}

async function runOpenRouter(jsonOutput: boolean, envFileOption?: string): Promise<void> {
  const localConfig = await loadClientProviderConfig(envFileOption);
  const details = await getOpenRouterDetails(localConfig, new Date());
  console.log(formatOpenRouterDetailsOutput(details, jsonOutput));
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

  const answer = await prompts(
    {
      type: "text",
      name: "value",
      message: "Paste Cursor cookie header, curl command, or WorkosCursorSessionToken"
    },
    {
      onCancel: () => {
        process.exitCode = 1;
        return true;
      }
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
    const message = error instanceof Error ? error.message : "Unknown CLI error";
    console.error(`ai-cost: ${message}`);
    process.exit(1);
  });
}
