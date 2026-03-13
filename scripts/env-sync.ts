import { access } from "node:fs/promises";
import path from "node:path";
import { resolveClientEnvPath } from "../src/cli/client-config.js";
import { getBackendUrl, getStoredToken } from "../src/cli/credential-store.js";
import { readEnvFile, upsertEnvValue } from "../src/env-file.js";
import { SYNCABLE_ENV_KEYS, pickSyncableEnvValues, type SyncableEnvValues } from "../src/env-sync.js";
import type { CliEnvSyncRequest, CliEnvSyncResponse } from "../src/types.js";

type Mode = "upload" | "download";

function parseArgs(argv: string[]): { mode: Mode; backendUrl?: string; envFilePath?: string } {
  const mode = argv[0] === "download" ? "download" : "upload";
  let backendUrl: string | undefined;
  let envFilePath: string | undefined;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--url") {
      backendUrl = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--env-path") {
      envFilePath = argv[index + 1];
      index += 1;
    }
  }

  return { mode, backendUrl, envFilePath };
}

function ensureBackendUrl(input: string): string {
  return new URL(input.trim().replace(/\/+$/, "")).toString().replace(/\/+$/, "");
}

async function requireFile(envFilePath: string): Promise<void> {
  try {
    await access(envFilePath);
  } catch {
    throw new Error(`Local env file not found: ${envFilePath}`);
  }
}

async function fetchRemoteEnv(backendUrl: string, token: string): Promise<SyncableEnvValues> {
  const response = await fetch(`${backendUrl}/api/cli/env`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 401) {
    throw new Error("Stored CLI token was rejected. Run `ai-cost login` again.");
  }

  if (!response.ok) {
    throw new Error(`Env download failed (${response.status}).`);
  }

  const payload = (await response.json()) as CliEnvSyncResponse;
  return payload.env as SyncableEnvValues;
}

async function uploadRemoteEnv(backendUrl: string, token: string, env: SyncableEnvValues): Promise<CliEnvSyncResponse> {
  const response = await fetch(`${backendUrl}/api/cli/env`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      env
    } satisfies CliEnvSyncRequest)
  });

  if (response.status === 401) {
    throw new Error("Stored CLI token was rejected. Run `ai-cost login` again.");
  }

  if (!response.ok) {
    throw new Error(`Env upload failed (${response.status}).`);
  }

  return (await response.json()) as CliEnvSyncResponse;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const backendUrl = ensureBackendUrl(options.backendUrl ?? (await getBackendUrl()) ?? "http://localhost:3000");
  const envFilePath = path.resolve(options.envFilePath ?? (await resolveClientEnvPath()));
  const token = await getStoredToken();

  if (!token) {
    throw new Error("No CLI token found. Run `ai-cost init` or `ai-cost login` first.");
  }

  if (options.mode === "upload") {
    await requireFile(envFilePath);
    const envFile = await readEnvFile(envFilePath);
    const env = pickSyncableEnvValues(envFile);
    const result = await uploadRemoteEnv(backendUrl, token, env);
    console.log(`Uploaded ${SYNCABLE_ENV_KEYS.length} syncable env values from ${envFilePath} to ${backendUrl}.`);
    console.log(`Server env file: ${result.envFilePath}`);
    return;
  }

  const remoteEnv = await fetchRemoteEnv(backendUrl, token);
  for (const key of SYNCABLE_ENV_KEYS) {
    await upsertEnvValue(envFilePath, key, remoteEnv[key]);
  }

  console.log(`Downloaded ${SYNCABLE_ENV_KEYS.length} syncable env values from ${backendUrl} to ${envFilePath}.`);
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown env sync error";
  console.error(`env-sync: ${message}`);
  process.exit(1);
});
