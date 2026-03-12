import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const CURSOR_COOKIE_ENV_KEY = "CURSOR_DASHBOARD_COOKIE";

function isLikelyRawToken(input: string): boolean {
  return /^[A-Za-z0-9._~-]{20,}$/.test(input);
}

export function extractCursorSessionToken(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const cookieMatch = trimmed.match(/WorkosCursorSessionToken=([^\s;'"^]+)/);
  if (cookieMatch) {
    return cookieMatch[1];
  }

  const jsonMatch = trimmed.match(
    /"name"\s*:\s*"WorkosCursorSessionToken"[\s\S]{0,400}?"value"\s*:\s*"([^"]+)"/
  );
  if (jsonMatch) {
    return jsonMatch[1];
  }

  if (!trimmed.includes("=") && !trimmed.includes("curl") && !trimmed.includes("http") && isLikelyRawToken(trimmed)) {
    return trimmed;
  }

  return null;
}

function formatEnvValue(value: string): string {
  if (value.length === 0) {
    return '""';
  }

  if (/^[^\s"'#\r\n]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/"/g, '\\"')}"`;
}

export async function upsertEnvValue(envFilePath: string, key: string, value: string): Promise<void> {
  const resolvedPath = path.resolve(envFilePath);
  let current = "";

  try {
    current = await readFile(resolvedPath, "utf8");
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const normalized = current.replace(/\r\n/g, "\n");
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  const assignment = `${key}=${formatEnvValue(value)}`;
  const existingIndex = lines.findIndex((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line) && line.split("=")[0]?.trim() === key);

  if (existingIndex >= 0) {
    lines[existingIndex] = assignment;
  } else {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(assignment);
  }

  const next = `${lines.join("\n").replace(/\n*$/, "\n")}`;
  await writeFile(resolvedPath, next, "utf8");
}

export async function saveCursorCookieToEnv(envFilePath: string, input: string): Promise<string> {
  const token = extractCursorSessionToken(input);

  if (!token) {
    throw new Error("Could not find WorkosCursorSessionToken in the provided input.");
  }

  await upsertEnvValue(envFilePath, CURSOR_COOKIE_ENV_KEY, token);
  return token;
}
