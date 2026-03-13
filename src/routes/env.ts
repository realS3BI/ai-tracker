import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { isAuthorizedRequest, sendUnauthorized } from "../auth/session.js";
import { isSyncableEnvKey, readServerSyncEnv, writeServerSyncEnv } from "../env-sync.js";

function isCliEnvSyncRequest(value: unknown): value is { env: Record<string, string> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { env?: unknown };
  if (!payload.env || typeof payload.env !== "object" || Array.isArray(payload.env)) {
    return false;
  }

  return Object.entries(payload.env).every(([key, entryValue]) => isSyncableEnvKey(key) && typeof entryValue === "string");
}

export async function registerEnvRoutes(app: FastifyInstance, config: AppConfig): Promise<void> {
  app.get("/api/cli/env", async (request, reply) => {
    if (!isAuthorizedRequest(request, config)) {
      sendUnauthorized(reply);
      return;
    }

    const { env, envFilePath } = await readServerSyncEnv(config);
    return reply.send({
      ok: true,
      env,
      envFilePath
    });
  });

  app.post("/api/cli/env", async (request, reply) => {
    if (!isAuthorizedRequest(request, config)) {
      sendUnauthorized(reply);
      return;
    }

    if (!isCliEnvSyncRequest(request.body)) {
      return reply.code(400).send({
        error: "invalid_request",
        message: "Invalid env sync payload."
      });
    }

    const { env } = request.body;
    const { envFilePath } = await writeServerSyncEnv(config, env);
    const next = await readServerSyncEnv(config);

    return reply.send({
      ok: true,
      env: next.env,
      envFilePath,
      updatedKeys: Object.keys(env).length
    });
  });
}
