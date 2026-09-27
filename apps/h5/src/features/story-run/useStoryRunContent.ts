import type { AccountStoryRunResponse } from "@interactive-story/api-contracts";
import type { RuntimeStoryDefinition, VideoStoryNode } from "@interactive-story/story-core";
import { useCallback, useEffect, useState } from "react";

import { getAccountAccessToken } from "../account-progress/account-access-token";
import { adaptChapterDto } from "../story-content/chapter-adapter";
import type { StoryContent } from "../story-content/story-content";
import {
  abandonExplorationRun,
  completeExplorationVideo,
  completeReplayVideo,
  fetchExplorationRun,
  selectExplorationChoice,
} from "./story-run-api";
import {
  clearStoryRunSession,
  loadStoryRunSession,
  saveStoryRunSession,
} from "./story-run-session";

export type StoryRunMode = "exploration" | "replay";

interface StoryRunState {
  status: "loading" | "ready" | "error";
  content: StoryContent | null;
  response: AccountStoryRunResponse | null;
  error: string | null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function adaptRunContent(response: AccountStoryRunResponse): StoryContent {
  const content = adaptChapterDto(response.chapter);
  let story: RuntimeStoryDefinition;

  if (response.run.mode === "exploration") {
    story = {
      ...content.story,
      id: response.engineSnapshot.storyId,
      entryNodeId: response.run.entryNodeCode,
    };
  } else {
    const sourceNode = content.story.nodes[response.run.entryNodeCode];
    if (!sourceNode || sourceNode.type !== "video") {
      throw new Error("Replay Run入口不是可播放的视频节点。");
    }
    const replayNode: VideoStoryNode = {
      ...sourceNode,
      onComplete: { type: "end" },
    };
    story = {
      id: response.engineSnapshot.storyId,
      title: content.story.title,
      entryNodeId: response.run.entryNodeCode,
      nodes: { [replayNode.id]: replayNode },
    };
  }

  return { ...content, story };
}

function readyState(response: AccountStoryRunResponse): StoryRunState {
  return {
    status: "ready",
    content: adaptRunContent(response),
    response,
    error: null,
  };
}

export function useStoryRunContent(
  chapterCode: string,
  mode: StoryRunMode,
  runId: string,
) {
  const [state, setState] = useState<StoryRunState>({
    status: "loading",
    content: null,
    response: null,
    error: null,
  });

  useEffect(() => {
    const token = getAccountAccessToken();
    if (!token) {
      setState({
        status: "error",
        content: null,
        response: null,
        error: "当前浏览器没有账号登录凭证，无法恢复剧情运行。",
      });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", content: null, response: null, error: null });
    const request =
      mode === "exploration"
        ? fetchExplorationRun(chapterCode, runId, token, controller.signal)
        : Promise.resolve(loadStoryRunSession(chapterCode, mode, runId));

    void request
      .then((response) => {
        if (controller.signal.aborted) return;
        if (!response) {
          throw new Error("Replay Run本地会话不存在，请从剧情地图重新进入。");
        }
        if (
          response.run.id !== runId ||
          response.run.mode !== mode ||
          response.chapter.code !== chapterCode
        ) {
          throw new Error("剧情运行上下文与当前页面不匹配。");
        }
        saveStoryRunSession(chapterCode, response);
        setState(readyState(response));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          content: null,
          response: null,
          error: `剧情运行恢复失败：${getErrorMessage(error)}`,
        });
      });

    return () => controller.abort();
  }, [chapterCode, mode, runId]);

  const commitResponse = useCallback(
    (response: AccountStoryRunResponse) => {
      if (
        response.run.id !== runId ||
        response.run.mode !== mode ||
        response.chapter.code !== chapterCode
      ) {
        throw new Error("服务端返回了不匹配的剧情运行上下文。");
      }
      saveStoryRunSession(chapterCode, response);
      setState(readyState(response));
      return response;
    },
    [chapterCode, mode, runId],
  );

  const completeVideo = useCallback(
    async (nodeCode: string) => {
      const token = getAccountAccessToken();
      const response = state.response;
      if (!token || !response) throw new Error("剧情运行上下文不可用。");
      if (response.run.status !== "active") throw new Error("当前剧情运行已经结束。");

      const request = {
        nodeCode,
        expectedRunVersion: response.run.version,
        requestKey: crypto.randomUUID(),
      };
      const next =
        mode === "exploration"
          ? await completeExplorationVideo(chapterCode, runId, token, request)
          : await completeReplayVideo(chapterCode, runId, token, request);
      return commitResponse(next);
    },
    [chapterCode, commitResponse, mode, runId, state.response],
  );

  const submitChoice = useCallback(
    async (sourceNodeCode: string, choiceCode: string) => {
      const token = getAccountAccessToken();
      const response = state.response;
      if (!token || !response) throw new Error("剧情运行上下文不可用。");
      if (mode !== "exploration") throw new Error("Replay模式不允许提交Choice。");
      if (response.run.status !== "active") throw new Error("当前剧情运行已经结束。");

      const next = await selectExplorationChoice(chapterCode, runId, token, {
        sourceNodeCode,
        choiceCode,
        expectedRunVersion: response.run.version,
        requestKey: crypto.randomUUID(),
      });
      return commitResponse(next);
    },
    [chapterCode, commitResponse, mode, runId, state.response],
  );

  const abandon = useCallback(async () => {
    const token = getAccountAccessToken();
    const response = state.response;
    if (!token || !response) throw new Error("剧情运行上下文不可用。");
    if (mode !== "exploration") return;
    if (response.run.status === "active") {
      await abandonExplorationRun(chapterCode, runId, token, {
        expectedRunVersion: response.run.version,
      });
    }
    clearStoryRunSession(chapterCode, mode, runId);
  }, [chapterCode, mode, runId, state.response]);

  const clearSession = useCallback(() => {
    clearStoryRunSession(chapterCode, mode, runId);
  }, [chapterCode, mode, runId]);

  return {
    ...state,
    initialSnapshot: state.response?.engineSnapshot ?? null,
    runStatus: state.response?.run.status ?? null,
    runVersion: state.response?.run.version ?? null,
    completeVideo,
    submitChoice,
    abandon,
    clearSession,
  };
}
