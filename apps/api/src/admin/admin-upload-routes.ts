import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { AdminVideoAssetDto, ApiErrorResponse } from "@interactive-story/api-contracts";

import { MediaPipelineError } from "../media/media-validation.js";
import type { VideoAssetUploadUseCase } from "../media/video-asset-upload-service.js";

interface VideoAssetParams {
  assetCode: string;
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
) {
  return reply.code(statusCode).send({ error: { code, message } } satisfies ApiErrorResponse);
}

function isUploadTooLarge(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "FST_REQ_FILE_TOO_LARGE"
  );
}

async function readUpload(request: FastifyRequest, maxBytes: number) {
  try {
    const part = await request.file({ limits: { files: 1, fileSize: maxBytes } });
    if (!part || part.fieldname !== "file") {
      throw new MediaPipelineError("UPLOAD_REQUIRED", "multipart 请求必须包含 file 字段。", 400);
    }
    return {
      filename: part.filename,
      mimeType: part.mimetype,
      stream: part.file,
    };
  } catch (error) {
    if (isUploadTooLarge(error)) {
      throw new MediaPipelineError("UPLOAD_TOO_LARGE", "上传文件超过大小限制。", 413, {
        cause: error,
      });
    }
    throw error;
  }
}

async function handleUploadError(error: unknown, reply: FastifyReply) {
  if (error instanceof MediaPipelineError) {
    return sendError(reply, error.statusCode, error.code, error.message);
  }
  throw error;
}

export async function registerAdminUploadRoutes(
  app: FastifyInstance,
  uploadService: VideoAssetUploadUseCase,
) {
  const multipartOverheadBytes = 1024 * 1024;
  app.post<{
    Params: VideoAssetParams;
    Reply: AdminVideoAssetDto | ApiErrorResponse;
  }>(
    "/v1/admin/video-assets/:assetCode/video",
    { bodyLimit: uploadService.maxVideoBytes + multipartOverheadBytes },
    async (request, reply) => {
    try {
      const upload = await readUpload(request, uploadService.maxVideoBytes);
      return await uploadService.uploadVideo(request.params.assetCode, upload);
    } catch (error) {
      return handleUploadError(error, reply);
    }
    },
  );

  app.post<{
    Params: VideoAssetParams;
    Reply: AdminVideoAssetDto | ApiErrorResponse;
  }>(
    "/v1/admin/video-assets/:assetCode/poster",
    { bodyLimit: uploadService.maxPosterBytes + multipartOverheadBytes },
    async (request, reply) => {
    try {
      const upload = await readUpload(request, uploadService.maxPosterBytes);
      return await uploadService.uploadPoster(request.params.assetCode, upload);
    } catch (error) {
      return handleUploadError(error, reply);
    }
    },
  );
}
