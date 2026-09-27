import { useCallback, useEffect } from "react";

import { analyticsClient } from "./analytics-client";

const CHAPTER_CODE = "chapter-01";

export function useLandingAnalytics() {
  useEffect(() => {
    analyticsClient.track({
      eventKey: "landing:page-view:v1",
      eventType: "page_view",
      chapterCode: CHAPTER_CODE,
      metadata: { page: "landing" },
    });
  }, []);

  const trackCtaClick = useCallback(() => {
    analyticsClient.track({
      eventKey: "landing:cta-clicked:v1",
      eventType: "landing_cta_clicked",
      chapterCode: CHAPTER_CODE,
      metadata: { page: "landing", destination: "/story" },
    });
  }, []);

  return { trackCtaClick };
}
