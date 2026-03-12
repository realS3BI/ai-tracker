import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getCodexDetails, getCodexSnapshot } from "../../src/providers/codex.js";
import { makeConfig } from "../helpers.js";

const now = new Date("2026-03-09T21:00:00.000Z");
const primaryResetAt = new Date(1773095381 * 1000).toISOString();
const secondaryResetAt = new Date(1773564753 * 1000).toISOString();
const cacheTemplate = {
  version: 1,
  provider: "openai-codex" as const,
  updatedAt: "2026-03-09T20:58:23.000Z",
  cachedAt: "2026-03-09T20:59:00.000Z",
  remainingDisplay: "96%/87%",
  usedDisplay: "4%/13%",
  limitDisplay: "5h/7d",
  resetAt: primaryResetAt,
  secondaryResetAt
};
const staleSessionTimestamp = "2026-03-08T08:00:00.000Z";
const sessionPayload = {
  type: "event_msg",
  payload: {
    type: "token_count",
    rate_limits: {
      limit_id: "codex",
      primary: {
        used_percent: 4,
        window_minutes: 300,
        resets_at: 1773095381
      },
      secondary: {
        used_percent: 13,
        window_minutes: 10080,
        resets_at: 1773564753
      }
    }
  }
};

const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "ai-cost-codex-"));
  tempDirs.push(dir);
  return dir;
}

async function writeCache(appDataDir: string, cache = cacheTemplate): Promise<string> {
  const cachePath = path.join(appDataDir, "codex-cache.json");
  await mkdir(path.dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf8");
  return cachePath;
}

async function writeSession(codexHome: string, timestamp: string): Promise<void> {
  const filePath = path.join(codexHome, "sessions", "2026", "03", "09", "rollout-2026-03-09T20-58-23-fixture.jsonl");
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify({
      timestamp,
      ...sessionPayload
    })}\n`,
    "utf8"
  );
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
});

describe("codex provider", () => {
  it("reads the latest account rate limits from local session logs and persists the cache", async () => {
    const appDataDir = await makeTempDir();
    const snapshot = await getCodexSnapshot(makeConfig({ APP_DATA_DIR: appDataDir }), now);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.provider).toBe("openai-codex");
    expect(snapshot.source).toBe("local-codex-session");
    expect(snapshot.remainingDisplay).toBe("96%/87%");
    expect(snapshot.usedDisplay).toBe("4%/13%");
    expect(snapshot.limitDisplay).toBe("5h/7d");
    expect(snapshot.resetAt).toBe(primaryResetAt);
    expect(snapshot.secondaryResetAt).toBe(secondaryResetAt);
    expect(snapshot.message).toBe("Local Codex session limits");

    const cachePath = path.join(appDataDir, "codex-cache.json");
    const cache = JSON.parse(await readFile(cachePath, "utf8")) as typeof cacheTemplate;
    expect(cache.updatedAt).toBe("2026-03-09T20:58:23.000Z");
    expect(cache.remainingDisplay).toBe("96%/87%");
    expect(cache.usedDisplay).toBe("4%/13%");
    expect(cache.limitDisplay).toBe("5h/7d");
  });

  it("keeps an identical cache file unchanged when the live snapshot matches", async () => {
    const appDataDir = await makeTempDir();
    const cachePath = await writeCache(appDataDir);
    const before = await readFile(cachePath, "utf8");

    const snapshot = await getCodexSnapshot(makeConfig({ APP_DATA_DIR: appDataDir }), now);

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("local-codex-session");
    const after = await readFile(cachePath, "utf8");
    expect(after).toBe(before);
  });

  it("uses the server fallback cache when no local session exists", async () => {
    const appDataDir = await makeTempDir();
    await writeCache(appDataDir);

    const snapshot = await getCodexSnapshot(
      makeConfig({
        CODEX_HOME: path.join(await makeTempDir(), "missing-codex-home"),
        APP_DATA_DIR: appDataDir
      }),
      now
    );

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("codex-cache");
    expect(snapshot.message).toBe("Using cached Codex limits from the persisted fallback cache.");
    expect(snapshot.updatedAt).toBe("2026-03-09T20:58:23.000Z");
  });

  it("prefers the server fallback cache over stale local session data", async () => {
    const codexHome = await makeTempDir();
    const appDataDir = await makeTempDir();
    await writeSession(codexHome, staleSessionTimestamp);
    await writeCache(appDataDir);

    const snapshot = await getCodexSnapshot(
      makeConfig({
        CODEX_HOME: codexHome,
        APP_DATA_DIR: appDataDir
      }),
      now
    );

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("codex-cache");
    expect(snapshot.updatedAt).toBe(cacheTemplate.updatedAt);
  });

  it("returns unsupported when only stale local session data exists", async () => {
    const codexHome = await makeTempDir();
    const appDataDir = await makeTempDir();
    await writeSession(codexHome, staleSessionTimestamp);

    const snapshot = await getCodexSnapshot(
      makeConfig({
        CODEX_HOME: codexHome,
        APP_DATA_DIR: appDataDir
      }),
      now
    );

    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.source).toBe("local-codex-session");
  });

  it("ignores a corrupt cache file when no fresh local data exists", async () => {
    const appDataDir = await makeTempDir();
    await writeFile(path.join(appDataDir, "codex-cache.json"), "{not-json", "utf8");

    const snapshot = await getCodexSnapshot(
      makeConfig({
        CODEX_HOME: path.join(await makeTempDir(), "missing-codex-home"),
        APP_DATA_DIR: appDataDir
      }),
      now
    );

    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.source).toBe("local-codex-session");
  });

  it("still returns live data when writing the cache fails", async () => {
    const parentDir = await makeTempDir();
    const blockingFile = path.join(parentDir, "not-a-directory");
    await writeFile(blockingFile, "blocked", "utf8");

    const snapshot = await getCodexSnapshot(
      makeConfig({
        APP_DATA_DIR: blockingFile
      }),
      now
    );

    expect(snapshot.status).toBe("ok");
    expect(snapshot.source).toBe("local-codex-session");
    expect(snapshot.message).toBe("Local Codex session limits");
  });

  it("returns codex detail metadata for live session data", async () => {
    const appDataDir = await makeTempDir();
    const details = await getCodexDetails(makeConfig({ APP_DATA_DIR: appDataDir }), now);

    expect(details.snapshot.status).toBe("ok");
    expect(details.codexHome).toContain(path.join("test", "fixtures", "codex-home"));
    expect(details.cachePath).toBe(path.join(appDataDir, "codex-cache.json"));
    expect(details.sourcePath).toContain(path.join("sessions", "2026", "03", "09", "rollout-2026-03-09T20-58-23-fixture.jsonl"));
    expect(details.selectedLimitId).toBe("codex");
    expect(details.freshnessWindowHours).toBe(12);
    expect(details.primary).toEqual({
      usedPercent: 4,
      remainingPercent: 96,
      windowMinutes: 300,
      windowLabel: "5h",
      resetAt: primaryResetAt
    });
    expect(details.secondary).toEqual({
      usedPercent: 13,
      remainingPercent: 87,
      windowMinutes: 10080,
      windowLabel: "7d",
      resetAt: secondaryResetAt
    });
  });

  it("returns codex detail metadata for cache fallback", async () => {
    const appDataDir = await makeTempDir();
    await writeCache(appDataDir);

    const details = await getCodexDetails(
      makeConfig({
        CODEX_HOME: path.join(await makeTempDir(), "missing-codex-home"),
        APP_DATA_DIR: appDataDir
      }),
      now
    );

    expect(details.snapshot.source).toBe("codex-cache");
    expect(details.cachePath).toBe(path.join(appDataDir, "codex-cache.json"));
    expect(details.sourcePath).toBeUndefined();
    expect(details.primary).toBeUndefined();
    expect(details.secondary).toBeUndefined();
  });
});
