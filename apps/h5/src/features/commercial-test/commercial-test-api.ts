import type { ApiErrorResponse, TestPaymentOfferDto } from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../../config/api-base-url";

function isPaymentOffer(value: unknown): value is TestPaymentOfferDto {
  if (!value || typeof value !== "object") return false;
  const offer = value as Record<string, unknown>;
  return (
    typeof offer.code === "string" &&
    typeof offer.chapterCode === "string" &&
    typeof offer.triggerNodeCode === "string" &&
    typeof offer.title === "string" &&
    (offer.description === null || typeof offer.description === "string") &&
    typeof offer.buttonLabel === "string" &&
    Number.isInteger(offer.priceMinor) &&
    typeof offer.currency === "string"
  );
}

export async function fetchPaymentOffer(
  chapterCode: string,
  nodeCode: string,
  signal?: AbortSignal,
): Promise<TestPaymentOfferDto | null> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/commercial-test/offers/${encodeURIComponent(chapterCode)}/${encodeURIComponent(nodeCode)}`,
    signal ? { signal } : undefined,
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(payload?.error.message ?? `Offer API 请求失败（${response.status}）。`);
  }
  const payload: unknown = await response.json();
  if (!isPaymentOffer(payload)) {
    throw new Error("Offer API 返回格式无效。");
  }
  return payload;
}
