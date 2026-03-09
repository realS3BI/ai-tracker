import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { isAuthorizedRequest, sendUnauthorized } from "../auth/session.js";
import { getSnapshot } from "../providers/index.js";
import { snapshotSummaryCards, snapshotTableHeaders, snapshotTableRows } from "../snapshot-view.js";

export async function registerSnapshotRoutes(
  app: FastifyInstance,
  config: AppConfig
): Promise<void> {
  app.get("/api/snapshot", async (request, reply) => {
    if (!isAuthorizedRequest(request, config)) {
      sendUnauthorized(reply);
      return;
    }

    const snapshot = await getSnapshot(config);
    return reply.send({
      ...snapshot,
      summaryCards: snapshotSummaryCards(snapshot),
      headers: snapshotTableHeaders(),
      rows: snapshotTableRows(snapshot)
    });
  });
}
