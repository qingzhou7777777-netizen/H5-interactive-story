import { AnalyticsEventType, StoryNodeType, type PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PrismaAnalyticsRepository } from "./prisma-analytics-repository.js";

describe("PrismaAnalyticsRepository funnel", () => {
  it("calculates landing, node, choice, ending, payment and UTM metrics", async () => {
    const sessions = [
      { id: "s1", durationMs: 60_000, utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "launch" },
      { id: "s2", durationMs: 30_000, utmSource: "facebook", utmMedium: "paid_social", utmCampaign: "launch" },
      { id: "s3", durationMs: 30_000, utmSource: "tiktok", utmMedium: "paid_social", utmCampaign: "launch" },
    ];
    const event = (
      sessionId: string,
      eventType: AnalyticsEventType,
      nodeCode: string | null = null,
      choiceCode: string | null = null,
      targetNodeCode: string | null = null,
    ) => ({ sessionId, eventType, nodeCode, choiceCode, targetNodeCode });
    const events = [
      event("s1", AnalyticsEventType.PAGE_VIEW),
      event("s1", AnalyticsEventType.LANDING_CTA_CLICKED),
      event("s1", AnalyticsEventType.NODE_ENTERED, "Node001"),
      event("s1", AnalyticsEventType.VIDEO_COMPLETED, "Node001"),
      event("s1", AnalyticsEventType.CHOICE_SELECTED, "Node001", "A", "Node002"),
      event("s1", AnalyticsEventType.ENDING_COMPLETED, "Ending002"),
      event("s1", AnalyticsEventType.PAYMENT_CLICKED, "Ending002"),
      event("s2", AnalyticsEventType.PAGE_VIEW),
      event("s2", AnalyticsEventType.LANDING_CTA_CLICKED),
      event("s2", AnalyticsEventType.NODE_ENTERED, "Node001"),
      event("s2", AnalyticsEventType.VIDEO_COMPLETED, "Node001"),
      event("s2", AnalyticsEventType.CHOICE_SELECTED, "Node001", "B", "Node003"),
      event("s2", AnalyticsEventType.ENDING_COMPLETED, "Ending003"),
      event("s3", AnalyticsEventType.PAGE_VIEW),
      event("s3", AnalyticsEventType.LANDING_CTA_CLICKED),
      event("s3", AnalyticsEventType.NODE_ENTERED, "Node001"),
    ];
    const prisma = {
      analyticsSession: { findMany: async () => sessions },
      analyticsEvent: { findMany: async () => events },
      chapter: {
        findUnique: async () => ({
          entryNode: { code: "Node001" },
          nodes: [
            {
              code: "Node001",
              title: "第一次见面",
              nodeType: StoryNodeType.VIDEO,
              outgoingChoices: [
                { code: "A", label: "接受邀请", targetNode: { code: "Node002" } },
                { code: "B", label: "拒绝邀请", targetNode: { code: "Node003" } },
              ],
            },
            { code: "Ending002", title: "接受邀请", nodeType: StoryNodeType.ENDING, outgoingChoices: [] },
            { code: "Ending003", title: "拒绝邀请", nodeType: StoryNodeType.ENDING, outgoingChoices: [] },
          ],
        }),
      },
    } as unknown as PrismaClient;

    const result = await new PrismaAnalyticsRepository(prisma).getFunnel({
      chapterCode: "chapter-01",
    });

    expect(result.sessions).toBe(3);
    expect(result.averageDurationMs).toBe(40_000);
    expect(result.summary).toMatchObject({
      landingViews: 3,
      landingCtaClicks: 3,
      landingCtaClickRate: 100,
      nodeEntered: 3,
      entryVideoCompletionRate: 66.67,
      endingCompleted: 2,
      endingCompletionRate: 66.67,
      paymentClicked: 1,
      paymentClickRate: 50,
      paymentSessionRate: 33.33,
    });
    expect(result.choices).toEqual([
      expect.objectContaining({ choiceCode: "A", uniqueSessions: 1, selectionRate: 50 }),
      expect.objectContaining({ choiceCode: "B", uniqueSessions: 1, selectionRate: 50 }),
    ]);
    expect(result.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          utmSource: "facebook",
          sessions: 2,
          endingCompletionRate: 100,
          paymentClickRate: 50,
        }),
        expect.objectContaining({
          utmSource: "tiktok",
          sessions: 1,
          endingCompletionRate: 0,
        }),
      ]),
    );
  });
});
