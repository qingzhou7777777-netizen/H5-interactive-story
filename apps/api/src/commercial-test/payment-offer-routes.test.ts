import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { PaymentOfferRepository } from "./payment-offer-repository.js";
import { registerPaymentOfferRoutes } from "./payment-offer-routes.js";

async function createApp() {
  const repository: PaymentOfferRepository = {
    async getActiveOffer(chapterCode, nodeCode) {
      return chapterCode === "chapter-01" && nodeCode === "Ending002"
        ? {
            code: "chapter01-ending002-unlock",
            chapterCode,
            triggerNodeCode: nodeCode,
            title: "解锁下一章",
            description: "测试报价",
            buttonLabel: "¥9.90 解锁下一章",
            priceMinor: 990,
            currency: "CNY",
          }
        : null;
    },
  };
  const app = Fastify();
  await registerPaymentOfferRoutes(app, repository);
  return app;
}

describe("Commercial test API", () => {
  it("returns only the configured active offer", async () => {
    const app = await createApp();
    const offer = await app.inject({
      method: "GET",
      url: "/v1/commercial-test/offers/chapter-01/Ending002",
    });
    const missing = await app.inject({
      method: "GET",
      url: "/v1/commercial-test/offers/chapter-01/Node001",
    });

    expect(offer.statusCode).toBe(200);
    expect(offer.json()).toMatchObject({ priceMinor: 990, currency: "CNY" });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });
});
