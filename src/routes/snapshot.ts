import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { isAuthorizedRequest, sendUnauthorized } from "../auth/session.js";
import {
  createCodexDetailCard,
  createCursorDetailCard,
  createOpenAiDetailCard,
  createOpenRouterDetailCard
} from "../provider-detail-view.js";
import { getProviderDetails } from "../providers/index.js";
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

    const now = new Date();
    const details = await getProviderDetails(config, now);
    const snapshot = {
      generatedAt: now.toISOString(),
      providers: details.map((provider) => provider.snapshot)
    };
    return reply.send({
      ...snapshot,
      summaryCards: snapshotSummaryCards(snapshot),
      headers: snapshotTableHeaders(),
      rows: snapshotTableRows(snapshot),
      providerDetails: [
        createCodexDetailCard(details[0]),
        createOpenAiDetailCard(details[1]),
        createOpenRouterDetailCard(details[2]),
        createCursorDetailCard(details[3])
      ]
    });
  });
}
