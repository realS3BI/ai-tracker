import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config.js";
import { registerSession } from "./auth/session.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerSnapshotRoutes } from "./routes/snapshot.js";
import { registerWebRoutes } from "./routes/web.js";
import rateLimit from "@fastify/rate-limit";

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    trustProxy: true
  });

  await registerSession(app, config);
  await app.register(rateLimit, {
    global: false
  });

  app.get("/api/health", async () => ({
    ok: true,
    now: new Date().toISOString()
  }));

  await registerAuthRoutes(app, config);
  await registerSnapshotRoutes(app, config);
  await registerWebRoutes(app);

  return app;
}
