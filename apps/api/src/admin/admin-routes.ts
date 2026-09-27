import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  AdminChapterDetailDto,
  AdminChapterSummaryDto,
  AdminContentStatusDto,
  AdminVideoAssetDto,
  AdminVideoStatusDto,
  ApiErrorResponse,
  UpdateAdminChapterStatusRequest,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

import {
  AdminContentValidationError,
  type AdminContentRepository,
} from "./admin-content-repository.js";

interface VideoAssetParams {
  assetCode: string;
}

interface ChapterParams {
  chapterCode: string;
}

const videoStatuses = new Set<AdminVideoStatusDto>([
  "uploading",
  "processing",
  "ready",
  "failed",
  "disabled",
]);
const contentStatuses = new Set<AdminContentStatusDto>([
  "draft",
  "active",
  "disabled",
]);

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({
    error: { code, message },
  } satisfies ApiErrorResponse);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOptionalUrl(value: unknown) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAllowedContentUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseVideoAssetUpdate(body: unknown):
  | { ok: true; value: UpdateAdminVideoAssetRequest }
  | { ok: false; message: string } {
  if (!isRecord(body)) {
    return { ok: false, message: "请求体必须是对象。" };
  }

  const allowedKeys = new Set(["playbackUrl", "posterUrl", "status"]);
  const keys = Object.keys(body);
  if (keys.length === 0 || keys.some((key) => !allowedKeys.has(key))) {
    return { ok: false, message: "只能修改 playbackUrl、posterUrl 和 status。" };
  }

  const input: UpdateAdminVideoAssetRequest = {};
  for (const field of ["playbackUrl", "posterUrl"] as const) {
    if (field in body) {
      const normalized = normalizeOptionalUrl(body[field]);
      if (normalized === undefined) {
        return { ok: false, message: `${field} 必须是字符串或 null。` };
      }
      if (normalized !== null && !isAllowedContentUrl(normalized)) {
        return {
          ok: false,
          message: `${field} 必须是站内绝对路径或 http/https URL。`,
        };
      }
      input[field] = normalized;
    }
  }

  if ("status" in body) {
    if (typeof body.status !== "string" || !videoStatuses.has(body.status as AdminVideoStatusDto)) {
      return { ok: false, message: "status 不是有效的视频状态。" };
    }
    input.status = body.status as AdminVideoStatusDto;
  }

  return { ok: true, value: input };
}

export async function registerAdminRoutes(
  app: FastifyInstance,
  repository: AdminContentRepository,
) {
  app.get<{ Reply: AdminVideoAssetDto[] }>("/v1/admin/video-assets", async () =>
    repository.listVideoAssets(),
  );

  app.patch<{
    Params: VideoAssetParams;
    Body: UpdateAdminVideoAssetRequest;
    Reply: AdminVideoAssetDto | ApiErrorResponse;
  }>("/v1/admin/video-assets/:assetCode", async (request, reply) => {
    const parsed = parseVideoAssetUpdate(request.body);
    if (!parsed.ok) {
      return sendError(reply, 400, "INVALID_VIDEO_ASSET_UPDATE", parsed.message);
    }

    try {
      const asset = await repository.updateVideoAsset(
        request.params.assetCode,
        parsed.value,
      );
      if (!asset) {
        return sendError(reply, 404, "VIDEO_ASSET_NOT_FOUND", "视频资源不存在。" );
      }
      return asset;
    } catch (error) {
      if (error instanceof AdminContentValidationError) {
        return sendError(reply, 409, error.code, error.message);
      }
      throw error;
    }
  });

  app.get<{ Reply: AdminChapterSummaryDto[] }>("/v1/admin/chapters", async () =>
    repository.listChapters(),
  );

  app.get<{
    Params: ChapterParams;
    Reply: AdminChapterDetailDto | ApiErrorResponse;
  }>("/v1/admin/chapters/:chapterCode", async (request, reply) => {
    const chapter = await repository.getChapter(request.params.chapterCode);
    if (!chapter) {
      return sendError(reply, 404, "CHAPTER_NOT_FOUND", "章节不存在。" );
    }
    return chapter;
  });

  app.patch<{
    Params: ChapterParams;
    Body: UpdateAdminChapterStatusRequest;
    Reply: AdminChapterDetailDto | ApiErrorResponse;
  }>("/v1/admin/chapters/:chapterCode/status", async (request, reply) => {
    const body: unknown = request.body;
    if (
      !isRecord(body) ||
      Object.keys(body).length !== 1 ||
      typeof body.status !== "string" ||
      !contentStatuses.has(body.status as AdminContentStatusDto)
    ) {
      return sendError(reply, 400, "INVALID_CHAPTER_STATUS", "status 不是有效的章节状态。" );
    }

    try {
      const chapter = await repository.updateChapterStatus(
        request.params.chapterCode,
        body.status as AdminContentStatusDto,
      );
      if (!chapter) {
        return sendError(reply, 404, "CHAPTER_NOT_FOUND", "章节不存在。" );
      }
      return chapter;
    } catch (error) {
      if (error instanceof AdminContentValidationError) {
        return sendError(reply, 409, error.code, error.message);
      }
      throw error;
    }
  });
}
