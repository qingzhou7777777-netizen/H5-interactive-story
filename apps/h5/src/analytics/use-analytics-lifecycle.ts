import { useEffect } from "react";

import { analyticsClient } from "./analytics-client";

export function useAnalyticsLifecycle() {
  useEffect(() => {
    analyticsClient.start();
    return () => analyticsClient.stop();
  }, []);
}
