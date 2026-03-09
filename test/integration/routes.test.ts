import argon2 from "argon2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config.js";
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
      return new Response(JSON.stringify({ data: [{ amount: { value: 10 } }] }), {
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
    return new Response("{}", { status: 404 });
  });

  vi.stubGlobal("fetch", fetchMock);
}

describe("auth + snapshot routes", () => {
  let config: AppConfig;

  beforeEach(async () => {
    installProviderFetchMock();
    config = makeConfig({
      APP_PASSWORD_HASH: await argon2.hash("my-password"),
      APP_SECURE_COOKIE: false,
      appSecureCookie: false
    });
  });

  afterEach(() => {
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
  });

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

    await app.close();
  });

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
  });
});
