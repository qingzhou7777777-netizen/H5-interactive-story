import { useCallback, useEffect, useState } from "react";

import type {
  AccountChapterProgressResponse,
  StoryEngineSnapshotDto,
} from "@interactive-story/api-contracts";

import { isStaticDeployment } from "../../config/deployment-mode";
import { getAccountAccessToken } from "../account-progress/account-access-token";
import {
  AccountProgressApiError,
  completeAccountVideo as submitAccountVideoCompletion,
  fetchAccountProgress,
  selectAccountChoice,
  startAccountChapter,
} from "../account-progress/account-progress-api";
import { adaptChapterDto } from "./chapter-adapter";
import { fallbackStoryContent } from "./fallback-story-content";
import type { StoryContent, SubmitStoryChoice } from "./story-content";
import { fetchChapterContent, submitStoryChoice } from "./story-content-api";

interface StoryContentState {
  status: "loading" | "ready" | "error";
  content: StoryContent | null;
  warning: string | null;
  error: string | null;
  accountProgress: AccountChapterProgressResponse | null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

export function useStoryContent(chapterCode = "chapter-01") {
  const [state, setState] = useState<StoryContentState>({
    status: "loading",
    content: null,
    warning: null,
    error: null,
    accountProgress: null,
  });

  useEffect(() => {
    if (isStaticDeployment()) {
      setState({
        status: "ready",
        content: fallbackStoryContent,
        warning: null,
        error: null,
        accountProgress: null,
      });
      return;
    }

    const accessToken = getAccountAccessToken();
    if (accessToken) {
      let cancelled = false;
      void fetchAccountProgress(chapterCode, accessToken)
        .catch((error: unknown) => {
          if (
            error instanceof AccountProgressApiError &&
            error.code === "CHAPTER_PROGRESS_NOT_FOUND"
          ) {
            return startAccountChapter(chapterCode, accessToken);
          }
          throw error;
        })
        .then((progress) => {
          if (cancelled) return;
          setState({
            status: "ready",
            content: adaptChapterDto(progress.chapter),
            warning: null,
            error: null,
            accountProgress: progress,
          });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setState({
            status: "error",
            content: null,
            warning: null,
            error: `账号剧情进度加载失败：${getErrorMessage(error)}`,
            accountProgress: null,
          });
        });
      return () => {
        cancelled = true;
      };
    }

    const controller = new AbortController();

    void fetchChapterContent(chapterCode, controller.signal)
      .then((chapter) => {
        setState({
          status: "ready",
          content: adaptChapterDto(chapter),
          warning: null,
          error: null,
          accountProgress: null,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setState({
          status: "ready",
          content: fallbackStoryContent,
          warning: `内容 API 暂不可用，已切换本地测试模式：${getErrorMessage(error)}`,
          error: null,
          accountProgress: null,
        });
      });

    return () => controller.abort();
  }, [chapterCode]);

  const completeVideo = useCallback(
    async (nodeCode: string): Promise<StoryEngineSnapshotDto | null> => {
      const accessToken = getAccountAccessToken();
      const accountProgress = state.accountProgress;
      if (!accessToken || !accountProgress) return null;

      const nextProgress = await submitAccountVideoCompletion(
        chapterCode,
        accessToken,
        {
          releaseId: accountProgress.release.id,
          nodeCode,
          expectedProgressVersion: accountProgress.progress.version,
          requestKey: crypto.randomUUID(),
        },
      );
      setState((current) => ({
        ...current,
        content: adaptChapterDto(nextProgress.chapter),
        accountProgress: nextProgress,
      }));
      return nextProgress.engineSnapshot;
    },
    [chapterCode, state.accountProgress],
  );

  const submitChoice = useCallback<SubmitStoryChoice>(
    async (nodeId, choiceId) => {
      const accessToken = getAccountAccessToken();
      const accountProgress = state.accountProgress;
      if (accessToken && accountProgress) {
        const nextProgress = await selectAccountChoice(
          chapterCode,
          accessToken,
          {
            releaseId: accountProgress.release.id,
            sourceNodeCode: nodeId,
            choiceCode: choiceId,
            expectedProgressVersion: accountProgress.progress.version,
            requestKey: crypto.randomUUID(),
          },
        );
        setState((current) => ({
          ...current,
          content: adaptChapterDto(nextProgress.chapter),
          accountProgress: nextProgress,
        }));
        return {
          targetNodeId: nextProgress.engineSnapshot.currentNodeId,
          engineSnapshot: nextProgress.engineSnapshot,
        };
      }

      if (state.content?.source === "fallback") {
        const node = state.content.story.nodes[nodeId];
        const choices =
          node?.type === "choice"
            ? node.choices
            : node?.type === "video" && node.onComplete.type === "choices"
              ? node.onComplete.choices
              : [];
        const choice = choices.find((candidate) => candidate.id === choiceId);
        if (!choice) {
          throw new Error("本地剧情中不存在该选项。");
        }
        return { targetNodeId: choice.targetNodeId };
      }

      const response = await submitStoryChoice(chapterCode, { nodeId, choiceId });
      return { targetNodeId: response.targetNodeId };
    },
    [chapterCode, state.accountProgress, state.content],
  );

  return {
    ...state,
    isAccountMode: state.accountProgress !== null,
    initialSnapshot: state.accountProgress?.engineSnapshot ?? null,
    completeVideo,
    submitChoice,
  };
}
