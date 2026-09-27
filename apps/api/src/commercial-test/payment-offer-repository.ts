import type { TestPaymentOfferDto } from "@interactive-story/api-contracts";

export interface PaymentOfferRepository {
  getActiveOffer(
    chapterCode: string,
    nodeCode: string,
  ): Promise<TestPaymentOfferDto | null>;
}
