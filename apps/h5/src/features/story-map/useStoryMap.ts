import type { AccountStoryMapResponse } from "@interactive-story/api-contracts";
import { useCallback, useEffect, useState } from "react";

import { getAccountAccessToken } from "../account-progress/account-access-token";
import { fetchStoryMap } from "./story-map-api";

interface StoryMapState {
  status: "loading" | "ready" | "error";
  data: AccountStoryMapResponse | null;
  error: string | null;
}

export function useStoryMap(chapterCode: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StoryMapState>({
    status: "loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    const token = getAccountAccessToken();
    if (!token) {
      setState({
        status: "error",
        data: null,
        error: "当前浏览器没有账号登录凭证，请先登录后查看剧情地图。",
      });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    void fetchStoryMap(chapterCode, token, controller.signal)
      .then((data) => {
        setState({ status: "ready", data, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "剧情地图加载失败。",
        });
      });
    return () => controller.abort();
  }, [attempt, chapterCode]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);
  return { ...state, retry };
}
