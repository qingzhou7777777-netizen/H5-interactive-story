import type { StoryRuntimeState } from "@interactive-story/story-core";
import { useCallback, useEffect } from "react";

import { analyticsClient } from "./analytics-client";

function eventPrefix(chapterCode: string, state: StoryRuntimeState) {
  return `${chapterCode}:${state.history.length}:${state.currentNodeId ?? "unknown"}`;
}

export function useStoryAnalytics(chapterCode: string, state: StoryRuntimeState) {
  useEffect(() => {
    if (!state.currentNodeId) {
      return;
    }
    analyticsClient.track({
      eventKey: `${eventPrefix(chapterCode, state)}:node-entered`,
      eventType: "node_entered",
      chapterCode,
      nodeCode: state.currentNodeId,
    });
  }, [chapterCode, state.currentNodeId, state.history.length]);

  useEffect(() => {
    if (state.phase !== "ended" || !state.currentNodeId) {
      return;
    }
    analyticsClient.track({
      eventKey: `${eventPrefix(chapterCode, state)}:ending-completed`,
      eventType: "ending_completed",
      chapterCode,
      nodeCode: state.currentNodeId,
      endingCode: state.currentNodeId,
    });
  }, [chapterCode, state.currentNodeId, state.history.length, state.phase]);

  const trackVideoCompleted = useCallback(() => {
    if (!state.currentNodeId) return;
    analyticsClient.track({
      eventKey: `${eventPrefix(chapterCode, state)}:video-completed`,
      eventType: "video_completed",
      chapterCode,
      nodeCode: state.currentNodeId,
    });
  }, [chapterCode, state]);

  const trackChoiceSelected = useCallback(
    (choiceCode: string, targetNodeCode: string) => {
      if (!state.currentNodeId) return;
      analyticsClient.track({
        eventKey: `${eventPrefix(chapterCode, state)}:choice-selected:${choiceCode}`,
        eventType: "choice_selected",
        chapterCode,
        nodeCode: state.currentNodeId,
        choiceCode,
        targetNodeCode,
      });
    },
    [chapterCode, state],
  );

  const trackPaymentClicked = useCallback(
    (offer: { code: string; priceMinor: number; currency: string }) => {
      if (!state.currentNodeId) return;
      analyticsClient.track({
        eventKey: `${eventPrefix(chapterCode, state)}:payment-clicked:${offer.code}`,
        eventType: "payment_clicked",
        chapterCode,
        nodeCode: state.currentNodeId,
        offerCode: offer.code,
        priceMinor: offer.priceMinor,
        currency: offer.currency,
      });
    },
    [chapterCode, state],
  );

  return { trackVideoCompleted, trackChoiceSelected, trackPaymentClicked };
}
