import type { TestPaymentOfferDto } from "@interactive-story/api-contracts";
import { useEffect, useState } from "react";

import { isStaticDeployment } from "../../config/deployment-mode";
import { fetchPaymentOffer } from "./commercial-test-api";

function createLocalPaymentOffer(
  chapterCode: string,
  nodeCode: string,
): TestPaymentOfferDto {
  return {
    code: `${chapterCode}-${nodeCode.toLowerCase()}-unlock`,
    chapterCode,
    triggerNodeCode: nodeCode,
    title: "解锁下一章",
    description: "解锁下一章，继续你的专属恋爱互动剧情。",
    buttonLabel: "¥9.90 解锁下一章",
    priceMinor: 990,
    currency: "CNY",
  };
}

export function usePaymentOffer(
  chapterCode: string,
  nodeCode: string | null,
  enabled: boolean,
  useLocalOffer = false,
) {
  const [offer, setOffer] = useState<TestPaymentOfferDto | null>(null);

  useEffect(() => {
    setOffer(null);
    if (!enabled || !nodeCode) {
      return;
    }

    if (isStaticDeployment() || useLocalOffer) {
      setOffer(createLocalPaymentOffer(chapterCode, nodeCode));
      return;
    }

    const controller = new AbortController();
    void fetchPaymentOffer(chapterCode, nodeCode, controller.signal)
      .then(setOffer)
      .catch(() => {
        if (!controller.signal.aborted) setOffer(null);
      });
    return () => controller.abort();
  }, [chapterCode, enabled, nodeCode, useLocalOffer]);

  return offer;
}
