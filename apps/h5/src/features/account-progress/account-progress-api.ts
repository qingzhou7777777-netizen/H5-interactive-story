import type {
  AccountChapterProgressResponse,
  ApiErrorResponse,
  CompleteAccountVideoRequest,
  SelectAccountChoiceRequest,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../../config/api-base-url";

export class AccountProgressApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AccountProgressApiError";
  }
}

async function requestProgress(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<AccountChapterProgressResponse> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as
    | AccountChapterProgressResponse
    | ApiErrorResponse;
  if (!response.ok) {
    const error = "error" in payload ? payload.error : null;
    throw new AccountProgressApiError(
      error?.message ?? `账号进度请求失败（${response.status}）。`,
      response.status,
      error?.code ?? "ACCOUNT_PROGRESS_REQUEST_FAILED",
    );
  }
  return payload as AccountChapterProgressResponse;
}

function chapterPath(chapterCode: string) {
  return `/v1/me/chapters/${encodeURIComponent(chapterCode)}`;
}

export function fetchAccountProgress(chapterCode: string, token: string) {
  return requestProgress(`${chapterPath(chapterCode)}/progress`, token);
}

export function startAccountChapter(chapterCode: string, token: string) {
  return requestProgress(`${chapterPath(chapterCode)}/start`, token, {
    method: "POST",
  });
}

export function completeAccountVideo(
  chapterCode: string,
  token: string,
  request: CompleteAccountVideoRequest,
) {
  return requestProgress(`${chapterPath(chapterCode)}/video-completions`, token, {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export function selectAccountChoice(
  chapterCode: string,
  token: string,
  request: SelectAccountChoiceRequest,
) {
  return requestProgress(`${chapterPath(chapterCode)}/choices`, token, {
    method: "POST",
    body: JSON.stringify(request),
  });
}
