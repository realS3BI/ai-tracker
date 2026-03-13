import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getServerSnapshotCachePath, readServerSnapshotCache, writeServerSnapshotCache } from "../src/server-snapshot-cache.js";
import { makeConfig } from "./helpers.js";

describe("server snapshot cache", () => {
  it("stores lastObserved and lastSuccessful separately per provider", async () => {
    const config = makeConfig();

    await writeServerSnapshotCache(
      config,
      {
        generatedAt: "2026-03-13T08:00:00.000Z",
        command: "show",
        providers: [
          {
            provider: "openai-api",
            status: "ok",
            title: "OpenAI API Balance",
            usedUsd: 10,
            remainingUsd: 90,
            limitUsd: 100,
            unit: "usd",
            updatedAt: "2026-03-13T08:00:00.000Z",
            message: "Initial upload",
            source: "official-api"
          }
        ],
        providerDetails: [
          {
            provider: "openai-api",
            title: "OpenAI API",
            status: "ok",
            entries: [
              { label: "Status", value: "ok" },
              { label: "Source", value: "official-api" }
            ]
          }
        ]
      },
      new Date("2026-03-13T08:00:10.000Z")
    );

    await writeServerSnapshotCache(
      config,
      {
        generatedAt: "2026-03-13T08:05:00.000Z",
        command: "openai",
        providers: [
          {
            provider: "openai-api",
            status: "error",
            title: "OpenAI API Balance",
            updatedAt: "2026-03-13T08:05:00.000Z",
            message: "Temporary error",
            source: "official-api"
          }
        ],
        providerDetails: [
          {
            provider: "openai-api",
            title: "OpenAI API",
            status: "error",
            entries: [
              { label: "Status", value: "error" },
              { label: "Source", value: "official-api" }
            ]
          }
        ]
      },
      new Date("2026-03-13T08:05:10.000Z")
    );

    const cache = await readServerSnapshotCache(config);
    expect(cache?.providers["openai-api"]?.lastObserved?.snapshot.message).toBe("Temporary error");
    expect(cache?.providers["openai-api"]?.lastObserved?.command).toBe("openai");
    expect(cache?.providers["openai-api"]?.lastSuccessful?.snapshot.message).toBe("Initial upload");
    expect(cache?.providers["openai-api"]?.lastSuccessful?.command).toBe("show");
  });

  it("ignores corrupt cache files", async () => {
    const config = makeConfig();
    const cachePath = getServerSnapshotCachePath(config);
    await mkdir(path.dirname(cachePath), { recursive: true });
    await writeFile(cachePath, "{not-json", "utf8");

    const cache = await readServerSnapshotCache(config);
    expect(cache).toBeNull();
  });

  it("writes the cache file to APP_DATA_DIR", async () => {
    const config = makeConfig();
    await writeServerSnapshotCache(
      config,
      {
        generatedAt: "2026-03-13T08:00:00.000Z",
        command: "show",
        providers: [],
        providerDetails: []
      },
      new Date("2026-03-13T08:00:10.000Z")
    );

    const raw = await readFile(getServerSnapshotCachePath(config), "utf8");
    expect(raw).toContain('"version": 1');
  });
});
