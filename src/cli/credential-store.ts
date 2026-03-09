import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type KeytarLike = {
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
};

interface CliConfigFile {
  backendUrl?: string;
}

const APP_DIR = join(homedir(), ".ai-cost");
const CONFIG_PATH = join(APP_DIR, "config.json");
const FALLBACK_KEY_PATH = join(APP_DIR, "token.key");
const FALLBACK_TOKEN_PATH = join(APP_DIR, "token.enc");
const SERVICE_NAME = "ai-cost";
const ACCOUNT_NAME = "default";

async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const content = await fs.readFile(path, "utf8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await fs.writeFile(path, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
}

function normalizeBackendUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

async function getKeytarClient(): Promise<KeytarLike | null> {
  try {
    const mod = await import("keytar");
    const client = (mod.default ?? mod) as KeytarLike;
    if (
      typeof client.getPassword !== "function" ||
      typeof client.setPassword !== "function" ||
      typeof client.deletePassword !== "function"
    ) {
      return null;
    }
    return client;
  } catch {
    return null;
  }
}

async function getOrCreateFallbackKey(): Promise<Buffer> {
  await ensureDir(APP_DIR);
  try {
    const existing = (await fs.readFile(FALLBACK_KEY_PATH, "utf8")).trim();
    const decoded = Buffer.from(existing, "base64");
    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // create a fresh key below
  }

  const key = randomBytes(32);
  await fs.writeFile(FALLBACK_KEY_PATH, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
  return key;
}

async function writeEncryptedFallbackToken(token: string): Promise<void> {
  const key = await getOrCreateFallbackKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  await writeJsonFile(FALLBACK_TOKEN_PATH, {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    payload: encrypted.toString("base64")
  });
}

async function readEncryptedFallbackToken(): Promise<string | null> {
  const raw = await readJsonFile<{ iv: string; tag: string; payload: string }>(FALLBACK_TOKEN_PATH);
  if (!raw) {
    return null;
  }

  try {
    const key = await getOrCreateFallbackKey();
    const iv = Buffer.from(raw.iv, "base64");
    const tag = Buffer.from(raw.tag, "base64");
    const payload = Buffer.from(raw.payload, "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export async function getBackendUrl(): Promise<string | null> {
  const config = await readJsonFile<CliConfigFile>(CONFIG_PATH);
  return config?.backendUrl ?? null;
}

export async function setBackendUrl(url: string): Promise<void> {
  const normalized = normalizeBackendUrl(url);
  await writeJsonFile(CONFIG_PATH, {
    backendUrl: normalized
  } satisfies CliConfigFile);
}

export async function getStoredToken(): Promise<string | null> {
  const keytar = await getKeytarClient();
  if (keytar) {
    const token = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (token) {
      return token;
    }
  }
  return await readEncryptedFallbackToken();
}

export async function setStoredToken(token: string): Promise<void> {
  const keytar = await getKeytarClient();
  if (keytar) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
    try {
      await fs.unlink(FALLBACK_TOKEN_PATH);
    } catch {
      // ignore
    }
    return;
  }
  await writeEncryptedFallbackToken(token);
}

export async function clearStoredToken(): Promise<void> {
  const keytar = await getKeytarClient();
  if (keytar) {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
  }
  try {
    await fs.unlink(FALLBACK_TOKEN_PATH);
  } catch {
    // ignore
  }
}
