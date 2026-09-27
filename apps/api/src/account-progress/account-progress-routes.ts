import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  AccountChapterProgressResponse,
  ApiErrorResponse,
  CompleteAccountVideoRequest,
  SelectAccountChoiceRequest,
} from "@interactive-story/api-contracts";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
  type AuthenticatedAccount,
} from "../auth/authentication.js";
import {
  AccountProgressError,
  type AccountProgressUseCase,
} from "./account-progress-service.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ChapterParams {
  chapterCode: string;
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

async function authenticate(
  authenticator: AccountAuthenticator,
  authorization: string | undefined,
) {
  return authenticator.authenticate(authorization);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVideoRequest(value: unknown): CompleteAccountVideoRequest | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "releaseId",
          "nodeCode",
          "expectedProgressVersion",
          "requestKey",
        ].includes(key),
    ) ||
    typeof value.releaseId !== "string" ||
    !uuidPattern.test(value.releaseId) ||
    typeof value.nodeCode !== "string" ||
    value.nodeCode.length === 0 ||
    value.nodeCode.length > 128 ||
    !Number.isSafeInteger(value.expectedProgressVersion) ||
    (value.expectedProgressVersion as number) < 0 ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as CompleteAccountVideoRequest;
}

function parseChoiceRequest(value: unknown): SelectAccountChoiceRequest | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "releaseId",
          "sourceNodeCode",
          "choiceCode",
          "expectedProgressVersion",
          "requestKey",
        ].includes(key),
    ) ||
    typeof value.releaseId !== "string" ||
    !uuidPattern.test(value.releaseId) ||
    typeof value.sourceNodeCode !== "string" ||
    value.sourceNodeCode.length === 0 ||
    value.sourceNodeCode.length > 128 ||
    typeof value.choiceCode !== "string" ||
    value.choiceCode.length === 0 ||
    value.choiceCode.length > 128 ||
    !Number.isSafeInteger(value.expectedProgressVersion) ||
    (value.expectedProgressVersion as number) < 0 ||
    typeof value.requestKey !== "string" ||
    !uuidPattern.test(value.requestKey)
  ) {
    return null;
  }
  return value as unknown as SelectAccountChoiceRequest;
}

async function execute(
  reply: FastifyReply,
  operation: (account: AuthenticatedAccount) => Promise<AccountChapterProgressResponse>,
  authenticateAccount: () => Promise<AuthenticatedAccount>,
) {
  try {
    const account = await authenticateAccount();
    return await operation(account);
  } catch (error) {
    if (error instanceof AccountAuthenticationError || error instanceof AccountProgressError) {
      return sendError(reply, error.statusCode, error.code, error.message);
    }
    throw error;
  }
}

export async function registerAccountProgressRoutes(
  app: FastifyInstance,
  authenticator: AccountAuthenticator,
  progress: AccountProgressUseCase,
) {
  app.get<{
    Params: ChapterParams;
    Reply: AccountChapterProgressResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/progress", async (request, reply) =>
    execute(
      reply,
      (account) => progress.getProgress(account.userId, request.params.chapterCode),
      () => authenticate(authenticator, request.headers.authorization),
    ),
  );

  app.post<{
    Params: ChapterParams;
    Reply: AccountChapterProgressResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/start", async (request, reply) =>
    execute(
      reply,
      (account) => progress.startChapter(account.userId, request.params.chapterCode),
      () => authenticate(authenticator, request.headers.authorization),
    ),
  );

  app.post<{
    Params: ChapterParams;
    Body: CompleteAccountVideoRequest;
    Reply: AccountChapterProgressResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/video-completions", async (request, reply) => {
    const body = parseVideoRequest(request.body);
    if (!body) {
      return sendError(reply, 400, "INVALID_PROGRESS_REQUEST", "视频完成参数无效。");
    }
    return execute(
      reply,
      (account) => progress.completeVideo(account.userId, request.params.chapterCode, body),
      () => authenticate(authenticator, request.headers.authorization),
    );
  });

  app.post<{
    Params: ChapterParams;
    Body: SelectAccountChoiceRequest;
    Reply: AccountChapterProgressResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/choices", async (request, reply) => {
    const body = parseChoiceRequest(request.body);
    if (!body) {
      return sendError(reply, 400, "INVALID_PROGRESS_REQUEST", "Choice 参数无效。");
    }
    return execute(
      reply,
      (account) => progress.selectChoice(account.userId, request.params.chapterCode, body),
      () => authenticate(authenticator, request.headers.authorization),
    );
  });
}
