import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
import { hashPassword } from "../../src/auth/password.js";
import { makeConfig } from "../helpers.js";

function installProviderFetchMock(options?: {
  openaiStatus?: number;
  openrouterStatus?: number;
}): void {
  const openaiStatus = options?.openaiStatus ?? 200;
  const openrouterStatus = options?.openrouterStatus ?? 200;

  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.openai.com")) {
      return new Response(JSON.stringify({ data: [{ results: [{ amount: { value: 10 } }] }] }), {
        status: openaiStatus
      });
    }
    if (url.includes("openrouter.ai")) {
      return new Response(
        JSON.stringify({
          data: {
            total_credits: 50,
            total_usage: 8
          }
        }),
        { status: openrouterStatus }
      );
    }
    if (url.includes("cursor.com/api/dashboard/get-current-period-usage")) {
      return new Response(
        JSON.stringify({
          billingCycleStart: "1772956730000",
          billingCycleEnd: "1775635130000",
          planUsage: {
            includedSpend: 1596,
            remaining: 404,
            limit: 2000,
            autoPercentUsed: 0,
            apiPercentUsed: 35.46666666666667
          }
        }),
        { status: 200 }
      );
    }
    if (url.includes("cursor.com/api/dashboard/get-aggregated-usage-events")) {
      return new Response(
        JSON.stringify({
          aggregations: [{ modelIntent: "gpt-5.3-codex", totalCents: 1362.482085 }]
        }),
        { status: 200 }
      );
    }
    return new Response("{}", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
}

describe("auth + snapshot routes", () => {
  let config: AppConfig;

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-09T21:00:00.000Z"));
    installProviderFetchMock();
    config = makeConfig({
      APP_PASSWORD_HASH: hashPassword("my-password"),
      APP_SECURE_COOKIE: false,
      appSecureCookie: false
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("denies /api/snapshot without auth", async () => {
    const app = await buildApp(config);
    const response = await app.inject({
      method: "GET",
      path: "/api/snapshot"
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  }, 15000);

  it("allows session-authenticated snapshot after login", async () => {
    const app = await buildApp(config);

    const login = await app.inject({
      method: "POST",
      path: "/api/auth/login",
      payload: {
        password: "my-password"
      }
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.headers["set-cookie"];
    expect(cookie).toBeTruthy();

    const snapshot = await app.inject({
      method: "GET",
      path: "/api/snapshot",
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : cookie
      }
    });

    expect(snapshot.statusCode).toBe(200);
    const payload = snapshot.json();
    expect(payload.providers).toHaveLength(4);
    expect(payload.providers.map((provider: { provider: string }) => provider.provider)).toEqual([
      "openai-codex",
      "openai-api",
      "openrouter",
      "cursor"
    ]);
    expect(payload.providers.find((provider: { provider: string }) => provider.provider === "openai-codex")?.status).toBe(
      "ok"
    );
    expect(payload.providers.find((provider: { provider: string }) => provider.provider === "cursor")?.status).toBe(
      "ok"
    );
    expect(payload.providerDetails).toHaveLength(4);
    expect(payload.providerDetails[0].title).toBe("OpenAI Codex");
    expect(payload.providerDetails[1].title).toBe("OpenAI API");
    expect(payload.providerDetails[2].entries.some((entry: { label: string }) => entry.label === "Per-key window")).toBe(true);
    expect(payload.providerDetails[3].entries.some((entry: { label: string }) => entry.label === "Top models")).toBe(true);

    await app.close();
  }, 15000);

  it("returns mixed provider statuses when one provider fails", async () => {
    installProviderFetchMock({ openaiStatus: 500, openrouterStatus: 200 });
    const app = await buildApp(config);

    const login = await app.inject({
      method: "POST",
      path: "/api/auth/login",
      payload: {
        password: "my-password"
      }
    });
    const cookie = login.headers["set-cookie"];

    const snapshot = await app.inject({
      method: "GET",
      path: "/api/snapshot",
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : cookie
      }
    });

    expect(snapshot.statusCode).toBe(200);
    const payload = snapshot.json();
    const openai = payload.providers.find((provider: { provider: string }) => provider.provider === "openai-api");
    const openrouter = payload.providers.find(
      (provider: { provider: string }) => provider.provider === "openrouter"
    );

    expect(openai.status).toBe("error");
    expect(openrouter.status).toBe("ok");
    await app.close();
  }, 15000);

  it("serves the dashboard html with provider detail section after login", async () => {
    const app = await buildApp(config);

    const login = await app.inject({
      method: "POST",
      path: "/api/auth/login",
      payload: {
        password: "my-password"
      }
    });
    const cookie = login.headers["set-cookie"];

    const response = await app.inject({
      method: "GET",
      path: "/",
      headers: {
        cookie: Array.isArray(cookie) ? cookie[0] : cookie
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('id="provider-details"');
    expect(response.body).toContain("detail-card");

    await app.close();
  }, 15000);
});
