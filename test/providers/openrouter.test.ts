import { afterEach, describe, expect, it, vi } from "vitest";
import { getOpenRouterSnapshot } from "../../src/providers/openrouter.js";
import { makeConfig } from "../helpers.js";

describe("getOpenRouterSnapshot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns credits data from official endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            total_credits: 120,
            total_usage: 47.25
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limitUsd).toBe(120);
    expect(snapshot.usedUsd).toBe(47.25);
    expect(snapshot.remainingUsd).toBe(72.75);
  });

  it("returns error when key is missing", async () => {
    const config = makeConfig({ OPENROUTER_API_KEY: undefined });
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("error");
  });

  it("returns unauthorized for 401/403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const config = makeConfig();
    const snapshot = await getOpenRouterSnapshot(config, new Date("2026-03-09T10:00:00.000Z"));
    expect(snapshot.status).toBe("unauthorized");
  });
});
