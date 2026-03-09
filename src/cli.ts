#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import prompts from "prompts";
import type { SnapshotResponse } from "./types.js";
import {
  clearStoredToken,
  getBackendUrl,
  getStoredToken,
  setBackendUrl,
  setStoredToken
} from "./cli/credential-store.js";
import { renderTable } from "./snapshot-view.js";

export { renderTable } from "./snapshot-view.js";

const DEFAULT_BACKEND_URL = "http://localhost:3000";

interface CliOptions {
  command: "show" | "login" | "logout" | "help";
  json: boolean;
  url?: string;
}

function parseArgs(argv: string[]): CliOptions {
  let command: CliOptions["command"] = "show";
  let json = false;
  let url: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "login" || arg === "logout" || arg === "help" || arg === "--help" || arg === "-h") {
      command = arg === "--help" || arg === "-h" ? "help" : arg;
      continue;
    }

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--url") {
      url = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return { command, json, url };
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

function printHelp(): void {
  console.log("Usage:");
  console.log("  ai-cost                Show snapshot");
  console.log("  ai-cost --json         Show raw JSON snapshot");
  console.log("  ai-cost login          Login and store API token");
  console.log("  ai-cost logout         Remove stored API token");
  console.log("Options:");
  console.log("  --url <backend-url>    Override backend URL");
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
  const response = await fetch(`${backendUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      password: answers.password,
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

  await setBackendUrl(backendUrl);
  await setStoredToken(payload.token);
  console.log(`Login successful. Backend: ${backendUrl}`);
}

async function runLogout(): Promise<void> {
  await clearStoredToken();
  console.log("Stored CLI token removed.");
}

async function runShow(jsonOutput: boolean, urlOption?: string): Promise<void> {
  const backendUrl = ensureBackendUrl(urlOption ?? (await getBackendUrl()) ?? DEFAULT_BACKEND_URL);
  const token = await getStoredToken();

  if (!token) {
    throw new Error("No CLI token found. Run `ai-cost login`.");
  }

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

  const payload = (await response.json()) as SnapshotResponse;
  console.log(formatSnapshotOutput(payload, jsonOutput));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  switch (options.command) {
    case "help":
      printHelp();
      return;
    case "login":
      await runLogin(options.url);
      return;
    case "logout":
      await runLogout();
      return;
    case "show":
      await runShow(options.json, options.url);
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
