import type { FastifyInstance, FastifyReply } from "fastify";

import type { ApiErrorResponse, TestPaymentOfferDto } from "@interactive-story/api-contracts";

import type { PaymentOfferRepository } from "./payment-offer-repository.js";

function sendError(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } } satisfies ApiErrorResponse);
}

export async function registerPaymentOfferRoutes(
  app: FastifyInstance,
  repository: PaymentOfferRepository,
) {
  app.get<{
    Params: { chapterCode: string; nodeCode: string };
    Reply: TestPaymentOfferDto | ApiErrorResponse;
  }>(
    "/v1/commercial-test/offers/:chapterCode/:nodeCode",
    async (request, reply) => {
      const { chapterCode, nodeCode } = request.params;
      if (!chapterCode || chapterCode.length > 128 || !nodeCode || nodeCode.length > 128) {
        return sendError(reply, 400, "INVALID_OFFER_QUERY", "Offer 查询参数无效。");
      }
      const offer = await repository.getActiveOffer(chapterCode, nodeCode);
      return offer ?? sendError(reply, 404, "PAYMENT_OFFER_NOT_FOUND", "当前节点没有测试报价。");
    },
  );
}
