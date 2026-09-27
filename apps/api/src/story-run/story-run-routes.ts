import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  AbandonExplorationRunRequest,
  AccountStoryRunResponse,
  ApiErrorResponse,
  CompleteStoryRunVideoRequest,
  SelectExplorationChoiceRequest,
  StartExplorationRunRequest,
  StartReplayRunRequest,
} from "@interactive-story/api-contracts";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
  type AuthenticatedAccount,
} from "../auth/authentication.js";
import { StoryMapError } from "../story-map/story-map-service.js";
import { StoryRunError, type StoryRunUseCase } from "./story-run-service.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ChapterParams {
  chapterCode: string;
}

interface RunParams extends ChapterParams {
  runId: string;
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  if (statusCode === 401) {
    reply.header("www-authenticate", 'Bearer realm="interactive-story-api"');
  }
  return reply.code(statusCode).send({
    error: { code, message },
  } satisfies ApiErrorResponse);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isNodeCode(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function isVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function parseExplorationStart(value: unknown): StartExplorationRunRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["releaseId", "entryNodeCode", "requestKey"]) ||
    typeof value.releaseId !== "string" ||
    !uuidPattern.test(value.releaseId) ||
    !isNodeCode(value.entryNodeCode) ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as StartExplorationRunRequest;
}

function parseReplayStart(value: unknown): StartReplayRunRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["releaseId", "nodeCode", "requestKey"]) ||
    typeof value.releaseId !== "string" ||
    !uuidPattern.test(value.releaseId) ||
    !isNodeCode(value.nodeCode) ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as StartReplayRunRequest;
}

function parseVideoCompletion(
  value: unknown,
): CompleteStoryRunVideoRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["nodeCode", "expectedRunVersion", "requestKey"]) ||
    !isNodeCode(value.nodeCode) ||
    !isVersion(value.expectedRunVersion) ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as CompleteStoryRunVideoRequest;
}

function parseExplorationChoice(
  value: unknown,
): SelectExplorationChoiceRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "sourceNodeCode",
      "choiceCode",
      "expectedRunVersion",
      "requestKey",
    ]) ||
    !isNodeCode(value.sourceNodeCode) ||
    !isNodeCode(value.choiceCode) ||
    !isVersion(value.expectedRunVersion) ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as SelectExplorationChoiceRequest;
}

function parseAbandon(value: unknown): AbandonExplorationRunRequest | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["expectedRunVersion"]) ||
    !isVersion(value.expectedRunVersion)
  ) {
    return null;
  }
  return value as unknown as AbandonExplorationRunRequest;
}

async function execute(
  reply: FastifyReply,
  operation: (account: AuthenticatedAccount) => Promise<AccountStoryRunResponse>,
  authenticateAccount: () => Promise<AuthenticatedAccount>,
  logFailure: (error: unknown) => void,
) {
  try {
    const account = await authenticateAccount();
    return await operation(account);
  } catch (error) {
    if (
      error instanceof AccountAuthenticationError ||
      error instanceof StoryRunError ||
      error instanceof StoryMapError
    ) {
      return sendError(reply, error.statusCode, error.code, error.message);
    }
    logFailure(error);
    return sendError(
      reply,
      503,
      "STORY_RUN_UNAVAILABLE",
      "剧情运行暂时不可用，请稍后重试。",
    );
  }
}

export async function registerStoryRunRoutes(
  app: FastifyInstance,
  authenticator: AccountAuthenticator,
  storyRuns: StoryRunUseCase,
) {
  const authenticate = (authorization: string | undefined) =>
    authenticator.authenticate(authorization);

  app.post<{
    Params: ChapterParams;
    Body: StartExplorationRunRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/exploration-runs", async (request, reply) => {
    const body = parseExplorationStart(request.body);
    if (!body) {
      return sendError(
        reply,
        400,
        "INVALID_STORY_RUN_REQUEST",
        "探索运行参数无效。",
      );
    }
    return execute(
      reply,
      (account) =>
        storyRuns.startExploration(
          account.userId,
          request.params.chapterCode,
          body,
        ),
      () => authenticate(request.headers.authorization),
      (error) => request.log.error({ err: error }, "exploration run start failed"),
    );
  });

  app.get<{
    Params: RunParams;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>(
    "/v1/me/chapters/:chapterCode/exploration-runs/:runId",
    async (request, reply) => {
      if (!uuidPattern.test(request.params.runId)) {
        return sendError(
          reply,
          400,
          "INVALID_STORY_RUN_REQUEST",
          "探索运行 ID 无效。",
        );
      }
      return execute(
        reply,
        (account) =>
          storyRuns.getExplorationRun(
            account.userId,
            request.params.chapterCode,
            request.params.runId,
          ),
        () => authenticate(request.headers.authorization),
        (error) => request.log.error({ err: error }, "exploration run query failed"),
      );
    },
  );

  app.post<{
    Params: RunParams;
    Body: CompleteStoryRunVideoRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>(
    "/v1/me/chapters/:chapterCode/exploration-runs/:runId/video-completions",
    async (request, reply) => {
      const body = parseVideoCompletion(request.body);
      if (!uuidPattern.test(request.params.runId) || !body) {
        return sendError(
          reply,
          400,
          "INVALID_STORY_RUN_REQUEST",
          "探索视频完成参数无效。",
        );
      }
      return execute(
        reply,
        (account) =>
          storyRuns.completeExplorationVideo(
            account.userId,
            request.params.chapterCode,
            request.params.runId,
            body,
          ),
        () => authenticate(request.headers.authorization),
        (error) =>
          request.log.error({ err: error }, "exploration video completion failed"),
      );
    },
  );

  app.post<{
    Params: RunParams;
    Body: SelectExplorationChoiceRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>(
    "/v1/me/chapters/:chapterCode/exploration-runs/:runId/choices",
    async (request, reply) => {
      const body = parseExplorationChoice(request.body);
      if (!uuidPattern.test(request.params.runId) || !body) {
        return sendError(
          reply,
          400,
          "INVALID_STORY_RUN_REQUEST",
          "探索 Choice 参数无效。",
        );
      }
      return execute(
        reply,
        (account) =>
          storyRuns.selectExplorationChoice(
            account.userId,
            request.params.chapterCode,
            request.params.runId,
            body,
          ),
        () => authenticate(request.headers.authorization),
        (error) => request.log.error({ err: error }, "exploration choice failed"),
      );
    },
  );

  app.post<{
    Params: RunParams;
    Body: AbandonExplorationRunRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>(
    "/v1/me/chapters/:chapterCode/exploration-runs/:runId/abandon",
    async (request, reply) => {
      const body = parseAbandon(request.body);
      if (!uuidPattern.test(request.params.runId) || !body) {
        return sendError(
          reply,
          400,
          "INVALID_STORY_RUN_REQUEST",
          "放弃探索参数无效。",
        );
      }
      return execute(
        reply,
        (account) =>
          storyRuns.abandonExplorationRun(
            account.userId,
            request.params.chapterCode,
            request.params.runId,
            body.expectedRunVersion,
          ),
        () => authenticate(request.headers.authorization),
        (error) => request.log.error({ err: error }, "exploration abandon failed"),
      );
    },
  );

  app.post<{
    Params: ChapterParams;
    Body: StartReplayRunRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/replay-runs", async (request, reply) => {
    const body = parseReplayStart(request.body);
    if (!body) {
      return sendError(
        reply,
        400,
        "INVALID_STORY_RUN_REQUEST",
        "重播运行参数无效。",
      );
    }
    return execute(
      reply,
      (account) =>
        storyRuns.startReplay(account.userId, request.params.chapterCode, body),
      () => authenticate(request.headers.authorization),
      (error) => request.log.error({ err: error }, "replay run start failed"),
    );
  });

  app.post<{
    Params: RunParams;
    Body: CompleteStoryRunVideoRequest;
    Reply: AccountStoryRunResponse | ApiErrorResponse;
  }>(
    "/v1/me/chapters/:chapterCode/replay-runs/:runId/video-completions",
    async (request, reply) => {
      const body = parseVideoCompletion(request.body);
      if (!uuidPattern.test(request.params.runId) || !body) {
        return sendError(
          reply,
          400,
          "INVALID_STORY_RUN_REQUEST",
          "重播视频完成参数无效。",
        );
      }
      return execute(
        reply,
        (account) =>
          storyRuns.completeReplayVideo(
            account.userId,
            request.params.chapterCode,
            request.params.runId,
            body,
          ),
        () => authenticate(request.headers.authorization),
        (error) => request.log.error({ err: error }, "replay video completion failed"),
      );
    },
  );
}
