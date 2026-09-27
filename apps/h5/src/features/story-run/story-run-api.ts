import type {
  AbandonExplorationRunRequest,
  AccountStoryRunResponse,
  ApiErrorResponse,
  CompleteStoryRunVideoRequest,
  SelectExplorationChoiceRequest,
  StartExplorationRunRequest,
  StartReplayRunRequest,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../../config/api-base-url";

export class StoryRunApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "StoryRunApiError";
  }
}

async function requestStoryRun(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<AccountStoryRunResponse> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | AccountStoryRunResponse
    | ApiErrorResponse
    | null;

  if (!response.ok) {
    const error = payload && "error" in payload ? payload.error : null;
    throw new StoryRunApiError(
      error?.message ?? `剧情运行请求失败（${response.status}）。`,
      response.status,
      error?.code ?? "STORY_RUN_REQUEST_FAILED",
    );
  }

  if (!payload || "error" in payload) {
    throw new StoryRunApiError(
      "剧情运行返回格式无效。",
      response.status,
      "STORY_RUN_RESPONSE_INVALID",
    );
  }
  return payload;
}

function chapterPath(chapterCode: string) {
  return `/v1/me/chapters/${encodeURIComponent(chapterCode)}`;
}

function explorationPath(chapterCode: string, runId?: string) {
  const base = `${chapterPath(chapterCode)}/exploration-runs`;
  return runId ? `${base}/${encodeURIComponent(runId)}` : base;
}

function replayPath(chapterCode: string, runId?: string) {
  const base = `${chapterPath(chapterCode)}/replay-runs`;
  return runId ? `${base}/${encodeURIComponent(runId)}` : base;
}

export function startExplorationRun(
  chapterCode: string,
  token: string,
  request: StartExplorationRunRequest,
) {
  return requestStoryRun(explorationPath(chapterCode), token, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function fetchExplorationRun(
  chapterCode: string,
  runId: string,
  token: string,
  signal?: AbortSignal,
) {
  return requestStoryRun(explorationPath(chapterCode, runId), token, {
    ...(signal ? { signal } : {}),
  });
}

export function completeExplorationVideo(
  chapterCode: string,
  runId: string,
  token: string,
  request: CompleteStoryRunVideoRequest,
) {
  return requestStoryRun(
    `${explorationPath(chapterCode, runId)}/video-completions`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function selectExplorationChoice(
  chapterCode: string,
  runId: string,
  token: string,
  request: SelectExplorationChoiceRequest,
) {
  return requestStoryRun(
    `${explorationPath(chapterCode, runId)}/choices`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function abandonExplorationRun(
  chapterCode: string,
  runId: string,
  token: string,
  request: AbandonExplorationRunRequest,
) {
  return requestStoryRun(
    `${explorationPath(chapterCode, runId)}/abandon`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}

export function startReplayRun(
  chapterCode: string,
  token: string,
  request: StartReplayRunRequest,
) {
  return requestStoryRun(replayPath(chapterCode), token, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function completeReplayVideo(
  chapterCode: string,
  runId: string,
  token: string,
  request: CompleteStoryRunVideoRequest,
) {
  return requestStoryRun(
    `${replayPath(chapterCode, runId)}/video-completions`,
    token,
    { method: "POST", body: JSON.stringify(request) },
  );
}
