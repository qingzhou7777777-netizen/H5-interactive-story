import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  AccountStoryMapResponse,
  ApiErrorResponse,
} from "@interactive-story/api-contracts";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "../auth/authentication.js";
import {
  StoryMapError,
  type StoryMapUseCase,
} from "./story-map-service.js";

interface ChapterParams {
  chapterCode: string;
}

function sendError(
  reply: FastifyReply,
  statusCode: 401 | 403 | 404 | 503,
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

export async function registerStoryMapRoutes(
  app: FastifyInstance,
  authenticator: AccountAuthenticator,
  storyMap: StoryMapUseCase,
) {
  app.get<{
    Params: ChapterParams;
    Reply: AccountStoryMapResponse | ApiErrorResponse;
  }>("/v1/me/chapters/:chapterCode/map", async (request, reply) => {
    try {
      const account = await authenticator.authenticate(
        request.headers.authorization,
      );
      return await storyMap.getMap(account.userId, request.params.chapterCode);
    } catch (error) {
      if (error instanceof AccountAuthenticationError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }
      if (error instanceof StoryMapError) {
        return sendError(reply, error.statusCode, error.code, error.message);
      }

      request.log.error({ err: error }, "story map query failed");
      return sendError(
        reply,
        503,
        "STORY_MAP_UNAVAILABLE",
        "剧情地图暂时不可用，请稍后重试。",
      );
    }
  });
}
