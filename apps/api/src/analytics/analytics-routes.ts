import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  AnalyticsFunnelDto,
  AnalyticsFunnelQuery,
  AnalyticsSessionDto,
  ApiErrorResponse,
  CreateAnalyticsEventRequest,
  CreateAnalyticsEventResponse,
  CreateAnalyticsSessionRequest,
  UpdateAnalyticsActivityRequest,
} from "@interactive-story/api-contracts";

import type { AnalyticsRepository } from "./analytics-repository.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventTypes = new Set([
  "page_view",
  "landing_cta_clicked",
  "node_entered",
  "video_completed",
  "choice_selected",
  "ending_completed",
  "payment_clicked",
]);

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } } satisfies ApiErrorResponse);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown, maxLength: number) {
  return value === undefined || value === null ||
    (typeof value === "string" && value.length <= maxLength);
}

function hasOnlyKeys(body: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(body).every((key) => allowed.has(key));
}

function isValidDate(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function parseSession(body: unknown): CreateAnalyticsSessionRequest | null {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, [
      "sessionKey",
      "landingPath",
      "referrer",
      "utmSource",
      "utmMedium",
      "utmCampaign",
      "utmContent",
      "utmTerm",
    ]) ||
    typeof body.sessionKey !== "string" ||
    !uuidPattern.test(body.sessionKey) ||
    typeof body.landingPath !== "string" ||
    !body.landingPath.startsWith("/") ||
    body.landingPath.length > 2048 ||
    !isOptionalString(body.referrer, 2048) ||
    !isOptionalString(body.utmSource, 255) ||
    !isOptionalString(body.utmMedium, 255) ||
    !isOptionalString(body.utmCampaign, 255) ||
    !isOptionalString(body.utmContent, 255) ||
    !isOptionalString(body.utmTerm, 255)
  ) {
    return null;
  }
  return body as unknown as CreateAnalyticsSessionRequest;
}

function parseActivity(body: unknown): UpdateAnalyticsActivityRequest | null {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ["durationMs", "ended"]) ||
    !Number.isInteger(body.durationMs) ||
    (body.durationMs as number) < 0 ||
    (body.durationMs as number) > 2_147_483_647 ||
    (body.ended !== undefined && typeof body.ended !== "boolean")
  ) {
    return null;
  }
  return body as unknown as UpdateAnalyticsActivityRequest;
}

function hasValidMetadata(value: unknown) {
  if (value === undefined || value === null) {
    return true;
  }
  if (!isRecord(value) || Object.keys(value).length > 10) {
    return false;
  }
  return Object.entries(value).every(
    ([key, item]) =>
      key.length <= 64 &&
      (item === null ||
        typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item)) ||
        (typeof item === "string" && item.length <= 255)),
  );
}

function parseEvent(body: unknown): CreateAnalyticsEventRequest | null {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, [
      "eventId",
      "eventKey",
      "sessionKey",
      "eventType",
      "occurredAt",
      "chapterCode",
      "nodeCode",
      "choiceCode",
      "targetNodeCode",
      "endingCode",
      "offerCode",
      "priceMinor",
      "currency",
      "metadata",
    ]) ||
    typeof body.eventId !== "string" ||
    !uuidPattern.test(body.eventId) ||
    typeof body.sessionKey !== "string" ||
    !uuidPattern.test(body.sessionKey) ||
    typeof body.eventKey !== "string" ||
    body.eventKey.length < 1 ||
    body.eventKey.length > 255 ||
    typeof body.eventType !== "string" ||
    !eventTypes.has(body.eventType) ||
    !isValidDate(body.occurredAt) ||
    !isOptionalString(body.chapterCode, 128) ||
    !isOptionalString(body.nodeCode, 128) ||
    !isOptionalString(body.choiceCode, 128) ||
    !isOptionalString(body.targetNodeCode, 128) ||
    !isOptionalString(body.endingCode, 128) ||
    !isOptionalString(body.offerCode, 128) ||
    (body.priceMinor !== undefined && body.priceMinor !== null &&
      (!Number.isInteger(body.priceMinor) || (body.priceMinor as number) < 0)) ||
    !isOptionalString(body.currency, 3) ||
    !hasValidMetadata(body.metadata)
  ) {
    return null;
  }

  const type = body.eventType;
  const hasChapter = typeof body.chapterCode === "string" && body.chapterCode.length > 0;
  const hasNode = typeof body.nodeCode === "string" && body.nodeCode.length > 0;
  const isLandingEvent = type === "page_view" || type === "landing_cta_clicked";
  if (
    !hasChapter ||
    (!isLandingEvent && !hasNode) ||
    (type === "choice_selected" &&
      (typeof body.choiceCode !== "string" || typeof body.targetNodeCode !== "string")) ||
    (type === "ending_completed" && typeof body.endingCode !== "string") ||
    (type === "payment_clicked" &&
      (typeof body.offerCode !== "string" ||
        !Number.isInteger(body.priceMinor) ||
        typeof body.currency !== "string"))
  ) {
    return null;
  }

  return body as unknown as CreateAnalyticsEventRequest;
}

function parseFunnelQuery(query: unknown): AnalyticsFunnelQuery | null {
  if (!isRecord(query) || !hasOnlyKeys(query, ["chapterCode", "from", "to", "utmSource"])) {
    return null;
  }
  if (
    !isOptionalString(query.chapterCode, 128) ||
    !isOptionalString(query.utmSource, 255) ||
    (query.from !== undefined && !isValidDate(query.from)) ||
    (query.to !== undefined && !isValidDate(query.to))
  ) {
    return null;
  }
  if (query.from && query.to && Date.parse(query.from as string) > Date.parse(query.to as string)) {
    return null;
  }
  return query as AnalyticsFunnelQuery;
}

export async function registerAnalyticsRoutes(
  app: FastifyInstance,
  repository: AnalyticsRepository,
  options: {
    rateLimit?: { max: number; timeWindow: number };
  } = {},
) {
  const routeOptions = options.rateLimit
    ? { config: { rateLimit: options.rateLimit } }
    : {};
  app.post<{
    Body: CreateAnalyticsSessionRequest;
    Reply: AnalyticsSessionDto | ApiErrorResponse;
  }>("/v1/analytics/sessions", routeOptions, async (request, reply) => {
    const input = parseSession(request.body);
    if (!input) {
      return sendError(reply, 400, "INVALID_ANALYTICS_SESSION", "Session 参数无效。");
    }
    return repository.createSession(input);
  });

  app.post<{
    Params: { sessionKey: string };
    Body: UpdateAnalyticsActivityRequest;
    Reply: AnalyticsSessionDto | ApiErrorResponse;
  }>("/v1/analytics/sessions/:sessionKey/activity", routeOptions, async (request, reply) => {
    if (!uuidPattern.test(request.params.sessionKey)) {
      return sendError(reply, 400, "INVALID_SESSION_KEY", "sessionKey 格式无效。");
    }
    const input = parseActivity(request.body);
    if (!input) {
      return sendError(reply, 400, "INVALID_ANALYTICS_ACTIVITY", "Activity 参数无效。");
    }
    const session = await repository.updateActivity(request.params.sessionKey, input);
    return session ?? sendError(reply, 404, "ANALYTICS_SESSION_NOT_FOUND", "Session 不存在。");
  });

  app.post<{
    Body: CreateAnalyticsEventRequest;
    Reply: CreateAnalyticsEventResponse | ApiErrorResponse;
  }>("/v1/analytics/events", routeOptions, async (request, reply) => {
    const input = parseEvent(request.body);
    if (!input) {
      return sendError(reply, 400, "INVALID_ANALYTICS_EVENT", "Event 参数无效。");
    }
    const event = await repository.recordEvent(input);
    return event ?? sendError(reply, 404, "ANALYTICS_SESSION_NOT_FOUND", "Session 不存在。");
  });
}

export async function registerAdminAnalyticsRoutes(
  app: FastifyInstance,
  repository: AnalyticsRepository,
) {
  app.get<{
    Querystring: AnalyticsFunnelQuery;
    Reply: AnalyticsFunnelDto | ApiErrorResponse;
  }>("/v1/admin/analytics/funnel", async (request, reply) => {
    const query = parseFunnelQuery(request.query);
    if (!query) {
      return sendError(reply, 400, "INVALID_FUNNEL_QUERY", "漏斗查询参数无效。");
    }
    return repository.getFunnel(query);
  });
}
