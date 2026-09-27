import {
  AnalyticsEventType,
  Prisma,
  StoryNodeType,
  type AnalyticsSession,
  type PrismaClient,
} from "@prisma/client";

import type {
  AnalyticsEventTypeDto,
  AnalyticsFunnelDto,
  AnalyticsFunnelQuery,
  AnalyticsSessionDto,
  CreateAnalyticsEventRequest,
  CreateAnalyticsEventResponse,
  CreateAnalyticsSessionRequest,
  UpdateAnalyticsActivityRequest,
} from "@interactive-story/api-contracts";

import type { AnalyticsRepository } from "./analytics-repository.js";

const eventTypeToPrisma: Record<AnalyticsEventTypeDto, AnalyticsEventType> = {
  page_view: AnalyticsEventType.PAGE_VIEW,
  landing_cta_clicked: AnalyticsEventType.LANDING_CTA_CLICKED,
  node_entered: AnalyticsEventType.NODE_ENTERED,
  video_completed: AnalyticsEventType.VIDEO_COMPLETED,
  choice_selected: AnalyticsEventType.CHOICE_SELECTED,
  ending_completed: AnalyticsEventType.ENDING_COMPLETED,
  payment_clicked: AnalyticsEventType.PAYMENT_CLICKED,
};

const eventTypeFromPrisma: Record<AnalyticsEventType, AnalyticsEventTypeDto> = {
  PAGE_VIEW: "page_view",
  LANDING_CTA_CLICKED: "landing_cta_clicked",
  NODE_ENTERED: "node_entered",
  VIDEO_COMPLETED: "video_completed",
  CHOICE_SELECTED: "choice_selected",
  ENDING_COMPLETED: "ending_completed",
  PAYMENT_CLICKED: "payment_clicked",
};

const funnelOrder: AnalyticsEventTypeDto[] = [
  "page_view",
  "landing_cta_clicked",
  "node_entered",
  "video_completed",
  "choice_selected",
  "ending_completed",
  "payment_clicked",
];

const nodeTypeMap = {
  [StoryNodeType.VIDEO]: "video",
  [StoryNodeType.CHOICE]: "choice",
  [StoryNodeType.ENDING]: "ending",
} as const;

function percentage(numerator: number, denominator: number) {
  return denominator === 0
    ? 0
    : Number(((numerator / denominator) * 100).toFixed(2));
}

function toSessionDto(session: AnalyticsSession): AnalyticsSessionDto {
  return {
    sessionKey: session.sessionKey,
    firstEnteredAt: session.firstEnteredAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    durationMs: session.durationMs,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createSession(input: CreateAnalyticsSessionRequest) {
    const now = new Date();
    const session = await this.prisma.analyticsSession.upsert({
      where: { sessionKey: input.sessionKey },
      update: { lastSeenAt: now },
      create: {
        sessionKey: input.sessionKey,
        firstEnteredAt: now,
        lastSeenAt: now,
        landingPath: input.landingPath,
        referrer: input.referrer ?? null,
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        utmCampaign: input.utmCampaign ?? null,
        utmContent: input.utmContent ?? null,
        utmTerm: input.utmTerm ?? null,
      },
    });
    return toSessionDto(session);
  }

  async updateActivity(sessionKey: string, input: UpdateAnalyticsActivityRequest) {
    const now = new Date();
    const [, activityUpdate] = await this.prisma.$transaction([
      this.prisma.analyticsSession.updateMany({
        where: { sessionKey, durationMs: { lt: input.durationMs } },
        data: { durationMs: input.durationMs },
      }),
      this.prisma.analyticsSession.updateMany({
        where: { sessionKey },
        data: {
          lastSeenAt: now,
          ...(input.ended ? { endedAt: now } : {}),
        },
      }),
    ]);
    if (activityUpdate.count === 0) {
      return null;
    }
    const session = await this.prisma.analyticsSession.findUniqueOrThrow({
      where: { sessionKey },
    });
    return toSessionDto(session);
  }

  async recordEvent(
    input: CreateAnalyticsEventRequest,
  ): Promise<CreateAnalyticsEventResponse | null> {
    const session = await this.prisma.analyticsSession.findUnique({
      where: { sessionKey: input.sessionKey },
      select: { id: true },
    });
    if (!session) {
      return null;
    }

    try {
      await this.prisma.analyticsEvent.create({
        data: {
          eventId: input.eventId,
          eventKey: input.eventKey,
          sessionId: session.id,
          eventType: eventTypeToPrisma[input.eventType],
          occurredAt: new Date(input.occurredAt),
          chapterCode: input.chapterCode ?? null,
          nodeCode: input.nodeCode ?? null,
          choiceCode: input.choiceCode ?? null,
          targetNodeCode: input.targetNodeCode ?? null,
          endingCode: input.endingCode ?? null,
          offerCode: input.offerCode ?? null,
          priceMinor: input.priceMinor ?? null,
          currency: input.currency ?? null,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });
      return { accepted: true, eventId: input.eventId, deduplicated: false };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const existing = await this.prisma.analyticsEvent.findFirst({
        where: {
          OR: [
            { eventId: input.eventId },
            { sessionId: session.id, eventKey: input.eventKey },
          ],
        },
        select: { eventId: true },
      });
      if (!existing) {
        throw error;
      }
      return { accepted: true, eventId: existing.eventId, deduplicated: true };
    }
  }

  async getFunnel(query: AnalyticsFunnelQuery): Promise<AnalyticsFunnelDto> {
    const dateFilter = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const hasDateFilter = Object.keys(dateFilter).length > 0;
    const sessions = await this.prisma.analyticsSession.findMany({
      where: {
        ...(hasDateFilter ? { firstEnteredAt: dateFilter } : {}),
        ...(query.utmSource ? { utmSource: query.utmSource } : {}),
        ...(query.chapterCode
          ? {
              events: {
                some: {
                  chapterCode: query.chapterCode,
                  ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        durationMs: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
      },
    });
    const sessionIds = sessions.map((session) => session.id);
    const events = sessionIds.length
      ? await this.prisma.analyticsEvent.findMany({
          where: {
            sessionId: { in: sessionIds },
            ...(query.chapterCode ? { chapterCode: query.chapterCode } : {}),
            ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
          },
          select: {
            sessionId: true,
            eventType: true,
            nodeCode: true,
            choiceCode: true,
            targetNodeCode: true,
          },
        })
      : [];

    const chapter = query.chapterCode
      ? await this.prisma.chapter.findUnique({
          where: { code: query.chapterCode },
          select: {
            entryNode: { select: { code: true } },
            nodes: {
              select: {
                code: true,
                title: true,
                nodeType: true,
                outgoingChoices: {
                  select: {
                    code: true,
                    label: true,
                    targetNode: { select: { code: true } },
                  },
                },
              },
              orderBy: { code: "asc" },
            },
          },
        })
      : null;

    const totalByType = new Map<AnalyticsEventTypeDto, number>();
    const sessionsByType = new Map<AnalyticsEventTypeDto, Set<string>>();
    const nodeSets = new Map<
      string,
      {
        nodeEntered: Set<string>;
        videoCompleted: Set<string>;
        choiceSelected: Set<string>;
        endingCompleted: Set<string>;
      }
    >();
    const choiceGroups = new Map<
      string,
      {
        nodeCode: string;
        choiceCode: string;
        targetNodeCode: string;
        sessions: Set<string>;
        totalEvents: number;
      }
    >();

    for (const node of chapter?.nodes ?? []) {
      nodeSets.set(node.code, {
        nodeEntered: new Set(),
        videoCompleted: new Set(),
        choiceSelected: new Set(),
        endingCompleted: new Set(),
      });
    }

    for (const event of events) {
      const eventType = eventTypeFromPrisma[event.eventType];
      totalByType.set(eventType, (totalByType.get(eventType) ?? 0) + 1);
      const typeSessions = sessionsByType.get(eventType) ?? new Set<string>();
      typeSessions.add(event.sessionId);
      sessionsByType.set(eventType, typeSessions);

      if (event.nodeCode) {
        const existing = nodeSets.get(event.nodeCode) ?? {
          nodeEntered: new Set<string>(),
          videoCompleted: new Set<string>(),
          choiceSelected: new Set<string>(),
          endingCompleted: new Set<string>(),
        };
        if (eventType === "node_entered") existing.nodeEntered.add(event.sessionId);
        if (eventType === "video_completed") existing.videoCompleted.add(event.sessionId);
        if (eventType === "choice_selected") existing.choiceSelected.add(event.sessionId);
        if (eventType === "ending_completed") existing.endingCompleted.add(event.sessionId);
        nodeSets.set(event.nodeCode, existing);
      }

      if (
        eventType === "choice_selected" &&
        event.nodeCode &&
        event.choiceCode &&
        event.targetNodeCode
      ) {
        const key = `${event.nodeCode}\u0000${event.choiceCode}\u0000${event.targetNodeCode}`;
        const group = choiceGroups.get(key) ?? {
          nodeCode: event.nodeCode,
          choiceCode: event.choiceCode,
          targetNodeCode: event.targetNodeCode,
          sessions: new Set<string>(),
          totalEvents: 0,
        };
        group.sessions.add(event.sessionId);
        group.totalEvents += 1;
        choiceGroups.set(key, group);
      }
    }

    const sessionCount = sessions.length;
    const steps = funnelOrder.map((eventType) => {
      const uniqueSessions = sessionsByType.get(eventType)?.size ?? 0;
      return {
        eventType,
        uniqueSessions,
        totalEvents: totalByType.get(eventType) ?? 0,
        conversionRate: percentage(uniqueSessions, sessionCount),
      };
    });

    const sourceBySession = new Map<string, string>();
    const sourceGroups = new Map<
      string,
      {
        utmSource: string;
        utmMedium: string;
        utmCampaign: string;
        sessions: Set<string>;
        totalDurationMs: number;
        nodeEntered: Set<string>;
        endingCompleted: Set<string>;
        paymentClicked: Set<string>;
      }
    >();
    for (const session of sessions) {
      const utmSource = session.utmSource ?? "(direct)";
      const utmMedium = session.utmMedium ?? "(none)";
      const utmCampaign = session.utmCampaign ?? "(none)";
      const key = `${utmSource}\u0000${utmMedium}\u0000${utmCampaign}`;
      const group = sourceGroups.get(key) ?? {
        utmSource,
        utmMedium,
        utmCampaign,
        sessions: new Set<string>(),
        totalDurationMs: 0,
        nodeEntered: new Set<string>(),
        endingCompleted: new Set<string>(),
        paymentClicked: new Set<string>(),
      };
      group.sessions.add(session.id);
      group.totalDurationMs += session.durationMs;
      sourceGroups.set(key, group);
      sourceBySession.set(session.id, key);
    }
    for (const event of events) {
      const sourceKey = sourceBySession.get(event.sessionId);
      const group = sourceKey ? sourceGroups.get(sourceKey) : null;
      if (!group) continue;
      if (event.eventType === AnalyticsEventType.NODE_ENTERED) {
        group.nodeEntered.add(event.sessionId);
      }
      if (event.eventType === AnalyticsEventType.ENDING_COMPLETED) {
        group.endingCompleted.add(event.sessionId);
      }
      if (event.eventType === AnalyticsEventType.PAYMENT_CLICKED) {
        group.paymentClicked.add(event.sessionId);
      }
    }

    const contentNodes = new Map((chapter?.nodes ?? []).map((node) => [node.code, node]));
    const choiceLabels = new Map<string, string>();
    for (const node of chapter?.nodes ?? []) {
      for (const choice of node.outgoingChoices) {
        choiceLabels.set(`${node.code}\u0000${choice.code}`, choice.label);
      }
    }
    const choiceDenominators = new Map<string, Set<string>>();
    for (const group of choiceGroups.values()) {
      const denominator = choiceDenominators.get(group.nodeCode) ?? new Set<string>();
      group.sessions.forEach((sessionId) => denominator.add(sessionId));
      choiceDenominators.set(group.nodeCode, denominator);
    }

    const nodes = [...nodeSets.entries()]
      .map(([nodeCode, types]) => {
        const definition = contentNodes.get(nodeCode);
        return {
          nodeCode,
          nodeTitle: definition?.title ?? nodeCode,
          nodeType: definition ? nodeTypeMap[definition.nodeType] : ("video" as const),
          entered: types.nodeEntered.size,
          videoCompleted: types.videoCompleted.size,
          videoCompletionRate: percentage(
            types.videoCompleted.size,
            types.nodeEntered.size,
          ),
          choiceSelected: types.choiceSelected.size,
          endingCompleted: types.endingCompleted.size,
        };
      })
      .sort((left, right) => left.nodeCode.localeCompare(right.nodeCode));

    const entryNodeCode = chapter?.entryNode?.code ?? null;
    const entryNode = nodes.find((node) => node.nodeCode === entryNodeCode);
    const landingViews = sessionsByType.get("page_view")?.size ?? 0;
    const landingCtaClicks = sessionsByType.get("landing_cta_clicked")?.size ?? 0;
    const nodeEntered = sessionsByType.get("node_entered")?.size ?? 0;
    const endingCompleted = sessionsByType.get("ending_completed")?.size ?? 0;
    const paymentClicked = sessionsByType.get("payment_clicked")?.size ?? 0;

    return {
      filters: {
        chapterCode: query.chapterCode ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        utmSource: query.utmSource ?? null,
      },
      sessions: sessionCount,
      averageDurationMs:
        sessionCount === 0
          ? 0
          : Math.round(
              sessions.reduce((total, session) => total + session.durationMs, 0) /
                sessionCount,
            ),
      summary: {
        landingViews,
        landingCtaClicks,
        landingCtaClickRate: percentage(landingCtaClicks, landingViews),
        nodeEntered,
        entryNodeCode,
        entryVideoCompletionRate: entryNode?.videoCompletionRate ?? 0,
        endingCompleted,
        endingCompletionRate: percentage(endingCompleted, sessionCount),
        paymentClicked,
        paymentClickRate: percentage(paymentClicked, endingCompleted),
        paymentSessionRate: percentage(paymentClicked, sessionCount),
      },
      steps,
      sources: [...sourceGroups.values()]
        .map((group) => ({
          utmSource: group.utmSource,
          utmMedium: group.utmMedium,
          utmCampaign: group.utmCampaign,
          sessions: group.sessions.size,
          averageDurationMs:
            group.sessions.size === 0
              ? 0
              : Math.round(group.totalDurationMs / group.sessions.size),
          nodeEntered: group.nodeEntered.size,
          endingCompleted: group.endingCompleted.size,
          paymentClicked: group.paymentClicked.size,
          endingCompletionRate: percentage(
            group.endingCompleted.size,
            group.sessions.size,
          ),
          paymentClickRate: percentage(
            group.paymentClicked.size,
            group.endingCompleted.size,
          ),
        }))
        .sort((left, right) => right.sessions - left.sessions),
      nodes,
      choices: [...choiceGroups.values()]
        .map((group) => ({
          nodeCode: group.nodeCode,
          choiceCode: group.choiceCode,
          choiceLabel:
            choiceLabels.get(`${group.nodeCode}\u0000${group.choiceCode}`) ??
            group.choiceCode,
          targetNodeCode: group.targetNodeCode,
          uniqueSessions: group.sessions.size,
          totalEvents: group.totalEvents,
          selectionRate: percentage(
            group.sessions.size,
            choiceDenominators.get(group.nodeCode)?.size ?? 0,
          ),
        }))
        .sort((left, right) =>
          `${left.nodeCode}:${left.choiceCode}`.localeCompare(
            `${right.nodeCode}:${right.choiceCode}`,
          ),
        ),
    };
  }
}
