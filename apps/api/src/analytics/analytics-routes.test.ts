import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type {
  AnalyticsFunnelDto,
  AnalyticsSessionDto,
  CreateAnalyticsEventRequest,
} from "@interactive-story/api-contracts";

import type { AnalyticsRepository } from "./analytics-repository.js";
import { registerAdminAnalyticsRoutes, registerAnalyticsRoutes } from "./analytics-routes.js";

const sessionKey = "d1251db3-f3db-4c48-8dc4-0df062e68654";
const eventId = "038be252-cae8-4bea-a2c7-4f77095578c3";

function createRepository(): AnalyticsRepository {
  let session: AnalyticsSessionDto | null = null;
  const eventKeys = new Set<string>();

  return {
    async createSession(input) {
      session ??= {
        sessionKey: input.sessionKey,
        firstEnteredAt: "2026-09-20T08:00:00.000Z",
        lastSeenAt: "2026-09-20T08:00:00.000Z",
        endedAt: null,
        durationMs: 0,
      };
      return session;
    },
    async updateActivity(key, input) {
      if (!session || key !== session.sessionKey) return null;
      session = {
        ...session,
        durationMs: Math.max(session.durationMs, input.durationMs),
        endedAt: input.ended ? "2026-09-20T08:01:00.000Z" : session.endedAt,
      };
      return session;
    },
    async recordEvent(input: CreateAnalyticsEventRequest) {
      if (!session || input.sessionKey !== session.sessionKey) return null;
      const deduplicated = eventKeys.has(input.eventKey);
      eventKeys.add(input.eventKey);
      return { accepted: true, eventId: input.eventId, deduplicated };
    },
    async getFunnel(query) {
      return {
        filters: {
          chapterCode: query.chapterCode ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
          utmSource: query.utmSource ?? null,
        },
        sessions: 1,
        averageDurationMs: 60_000,
        summary: {
          landingViews: 1,
          landingCtaClicks: 1,
          landingCtaClickRate: 100,
          nodeEntered: 1,
          entryNodeCode: "Node001",
          entryVideoCompletionRate: 100,
          endingCompleted: 1,
          endingCompletionRate: 100,
          paymentClicked: 0,
          paymentClickRate: 0,
          paymentSessionRate: 0,
        },
        steps: [
          {
            eventType: "ending_completed",
            uniqueSessions: 1,
            totalEvents: 1,
            conversionRate: 100,
          },
        ],
        sources: [{
          utmSource: "meta",
          utmMedium: "paid_social",
          utmCampaign: "launch",
          sessions: 1,
          averageDurationMs: 60_000,
          nodeEntered: 1,
          endingCompleted: 1,
          paymentClicked: 0,
          endingCompletionRate: 100,
          paymentClickRate: 0,
        }],
        nodes: [],
        choices: [],
      } satisfies AnalyticsFunnelDto;
    },
  };
}

async function createApp() {
  const app = Fastify();
  const repository = createRepository();
  await registerAnalyticsRoutes(app, repository);
  await registerAdminAnalyticsRoutes(app, repository);
  return app;
}

describe("Analytics API", () => {
  it("creates a session once and updates monotonic activity", async () => {
    const app = await createApp();
    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload: {
        sessionKey,
        landingPath: "/story?utm_source=meta",
        utmSource: "meta",
      },
    });
    const activityResponse = await app.inject({
      method: "POST",
      url: `/v1/analytics/sessions/${sessionKey}/activity`,
      payload: { durationMs: 60_000, ended: true },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({ sessionKey, durationMs: 0 });
    expect(activityResponse.statusCode).toBe(200);
    expect(activityResponse.json()).toMatchObject({ durationMs: 60_000 });
    expect(activityResponse.json().endedAt).not.toBeNull();
    await app.close();
  });

  it("accepts an event idempotently", async () => {
    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload: { sessionKey, landingPath: "/" },
    });
    const payload = {
      eventId,
      eventKey: "chapter-01:1:Node001:video-completed",
      sessionKey,
      eventType: "video_completed",
      occurredAt: "2026-09-20T08:00:10.000Z",
      chapterCode: "chapter-01",
      nodeCode: "Node001",
    };
    const first = await app.inject({ method: "POST", url: "/v1/analytics/events", payload });
    const second = await app.inject({ method: "POST", url: "/v1/analytics/events", payload });

    expect(first.json()).toMatchObject({ accepted: true, deduplicated: false });
    expect(second.json()).toMatchObject({ accepted: true, deduplicated: true });
    await app.close();
  });

  it("accepts landing events without a node code", async () => {
    const app = await createApp();
    await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload: { sessionKey, landingPath: "/?utm_source=facebook" },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/analytics/events",
      payload: {
        eventId,
        eventKey: "landing:page-view:v1",
        sessionKey,
        eventType: "page_view",
        occurredAt: "2026-09-20T08:00:10.000Z",
        chapterCode: "chapter-01",
        metadata: { page: "landing" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accepted: true });
    await app.close();
  });

  it("rejects malformed events and returns the admin funnel", async () => {
    const app = await createApp();
    const invalid = await app.inject({
      method: "POST",
      url: "/v1/analytics/events",
      payload: { eventType: "payment_clicked" },
    });
    const funnel = await app.inject({
      method: "GET",
      url: "/v1/admin/analytics/funnel?chapterCode=chapter-01&utmSource=meta",
    });

    expect(invalid.statusCode).toBe(400);
    expect(funnel.statusCode).toBe(200);
    expect(funnel.json()).toMatchObject({
      filters: { chapterCode: "chapter-01", utmSource: "meta" },
      sessions: 1,
      averageDurationMs: 60_000,
    });
    await app.close();
  });
});
