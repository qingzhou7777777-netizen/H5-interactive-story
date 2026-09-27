import type {
  ApiErrorResponse,
  ChapterDto,
  SubmitChoiceRequest,
  SubmitChoiceResponse,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../../config/api-base-url";

async function readApiResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (!response.ok) {
    const message =
      "error" in (payload as object)
        ? (payload as ApiErrorResponse).error.message
        : `API 请求失败（${response.status}）。`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchChapterContent(
  chapterCode: string,
  signal?: AbortSignal,
): Promise<ChapterDto> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/chapters/${encodeURIComponent(chapterCode)}`,
    signal ? { signal } : undefined,
  );
  return readApiResponse<ChapterDto>(response);
}

export async function submitStoryChoice(
  chapterCode: string,
  request: SubmitChoiceRequest,
): Promise<SubmitChoiceResponse> {
  const response = await fetch(
    `${getApiBaseUrl()}/v1/chapters/${encodeURIComponent(chapterCode)}/choices`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  return readApiResponse<SubmitChoiceResponse>(response);
}
