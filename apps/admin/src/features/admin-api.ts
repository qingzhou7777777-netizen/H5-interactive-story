import type {
  AdminChapterDetailDto,
  AdminChapterSummaryDto,
  AdminVideoAssetDto,
  AnalyticsFunnelDto,
  AnalyticsFunnelQuery,
  ApiErrorResponse,
  UpdateAdminChapterStatusRequest,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

import { getApiBaseUrl } from "../config/api-base-url";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
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

function uploadAssetFile(assetCode: string, kind: "video" | "poster", file: File) {
  const body = new FormData();
  body.set("file", file);
  return request<AdminVideoAssetDto>(
    `/v1/admin/video-assets/${encodeURIComponent(assetCode)}/${kind}`,
    { method: "POST", body },
  );
}

export function fetchAdminVideoAssets() {
  return request<AdminVideoAssetDto[]>("/v1/admin/video-assets");
}

export function updateAdminVideoAsset(
  assetCode: string,
  input: UpdateAdminVideoAssetRequest,
) {
  return request<AdminVideoAssetDto>(
    `/v1/admin/video-assets/${encodeURIComponent(assetCode)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function uploadAdminVideo(assetCode: string, file: File) {
  return uploadAssetFile(assetCode, "video", file);
}

export function uploadAdminPoster(assetCode: string, file: File) {
  return uploadAssetFile(assetCode, "poster", file);
}

export function fetchAdminChapters() {
  return request<AdminChapterSummaryDto[]>("/v1/admin/chapters");
}

export function fetchAdminChapter(chapterCode: string) {
  return request<AdminChapterDetailDto>(
    `/v1/admin/chapters/${encodeURIComponent(chapterCode)}`,
  );
}

export function updateAdminChapterStatus(
  chapterCode: string,
  input: UpdateAdminChapterStatusRequest,
) {
  return request<AdminChapterDetailDto>(
    `/v1/admin/chapters/${encodeURIComponent(chapterCode)}/status`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function fetchAnalyticsFunnel(query: AnalyticsFunnelQuery) {
  const search = new URLSearchParams();
  if (query.chapterCode) search.set("chapterCode", query.chapterCode);
  if (query.from) search.set("from", query.from);
  if (query.to) search.set("to", query.to);
  if (query.utmSource) search.set("utmSource", query.utmSource);
  return request<AnalyticsFunnelDto>(`/v1/admin/analytics/funnel?${search}`);
}
