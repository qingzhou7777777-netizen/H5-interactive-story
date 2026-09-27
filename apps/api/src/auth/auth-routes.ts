import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  ApiErrorResponse,
  CurrentUserResponse,
} from "@interactive-story/api-contracts";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "./authentication.js";

function sendError(
  reply: FastifyReply,
  statusCode: 401 | 403 | 503,
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

export async function registerAuthRoutes(
  app: FastifyInstance,
  authenticator: AccountAuthenticator,
) {
  app.get<{ Reply: CurrentUserResponse | ApiErrorResponse }>(
    "/v1/me",
    async (request, reply) => {
      try {
        return await authenticator.authenticate(request.headers.authorization);
      } catch (error) {
        if (error instanceof AccountAuthenticationError) {
          return sendError(
            reply,
            error.statusCode,
            error.code,
            error.message,
          );
        }

        request.log.error({ err: error }, "account authentication failed");
        return sendError(
          reply,
          503,
          "AUTHENTICATION_UNAVAILABLE",
          "认证服务暂时不可用，请稍后重试。",
        );
      }
    },
  );
}
