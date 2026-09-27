import { ContentStatus, type PrismaClient } from "@prisma/client";

import type { TestPaymentOfferDto } from "@interactive-story/api-contracts";

import type { PaymentOfferRepository } from "./payment-offer-repository.js";

export class PrismaPaymentOfferRepository implements PaymentOfferRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveOffer(
    chapterCode: string,
    nodeCode: string,
  ): Promise<TestPaymentOfferDto | null> {
    const offer = await this.prisma.testPaymentOffer.findFirst({
      where: {
        status: ContentStatus.ACTIVE,
        chapter: { code: chapterCode, status: ContentStatus.ACTIVE },
        triggerNode: {
          code: nodeCode,
          chapter: { code: chapterCode },
          status: ContentStatus.ACTIVE,
        },
      },
      include: {
        chapter: { select: { code: true } },
        triggerNode: { select: { code: true } },
      },
    });
    if (!offer) {
      return null;
    }

    return {
      code: offer.code,
      chapterCode: offer.chapter.code,
      triggerNodeCode: offer.triggerNode.code,
      title: offer.title,
      description: offer.description,
      buttonLabel: offer.buttonLabel,
      priceMinor: offer.priceMinor,
      currency: offer.currency,
    };
  }
}
