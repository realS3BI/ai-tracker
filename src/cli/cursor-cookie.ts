import { upsertEnvValue } from "../env-file.js";

export { upsertEnvValue } from "../env-file.js";

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

export async function saveCursorCookieToEnv(envFilePath: string, input: string): Promise<string> {
  const token = extractCursorSessionToken(input);

  if (!token) {
    throw new Error("Could not find WorkosCursorSessionToken in the provided input.");
  }

  await upsertEnvValue(envFilePath, CURSOR_COOKIE_ENV_KEY, token);
  return token;
}
