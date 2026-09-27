import type { FastifyInstance, FastifyReply } from "fastify";

import type {
  ApiErrorResponse,
  ChapterDto,
  NodeDto,
  SubmitChoiceRequest,
  SubmitChoiceResponse,
  VideoAssetDto,
} from "@interactive-story/api-contracts";

import type { StoryContentRepository } from "./story-content-repository.js";

interface ChapterParams {
  chapterCode: string;
}

interface NodeParams extends ChapterParams {
  nodeId: string;
}

interface VideoAssetParams {
  assetId: string;
}

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

export async function registerStoryRoutes(
  app: FastifyInstance,
  repository: StoryContentRepository,
) {
  app.get<{ Params: ChapterParams; Reply: ChapterDto | ApiErrorResponse }>(
    "/v1/chapters/:chapterCode",
    async (request, reply) => {
      const chapter = await repository.getChapter(request.params.chapterCode);
      if (!chapter) {
        return sendError(reply, 404, "CHAPTER_NOT_FOUND", "章节不存在或尚未发布。");
      }

      return chapter;
    },
  );

  app.get<{ Params: NodeParams; Reply: NodeDto | ApiErrorResponse }>(
    "/v1/chapters/:chapterCode/nodes/:nodeId",
    async (request, reply) => {
      const node = await repository.getNode(
        request.params.chapterCode,
        request.params.nodeId,
      );
      if (!node) {
        return sendError(reply, 404, "NODE_NOT_FOUND", "剧情节点不存在。");
      }

      return node;
    },
  );

  app.get<{ Params: VideoAssetParams; Reply: VideoAssetDto | ApiErrorResponse }>(
    "/v1/video-assets/:assetId",
    async (request, reply) => {
      const asset = await repository.getVideoAsset(request.params.assetId);
      if (!asset) {
        return sendError(reply, 404, "VIDEO_ASSET_NOT_FOUND", "视频资源不存在或未就绪。");
      }

      return asset;
    },
  );

  app.post<{
    Params: ChapterParams;
    Body: SubmitChoiceRequest;
    Reply: SubmitChoiceResponse | ApiErrorResponse;
  }>("/v1/chapters/:chapterCode/choices", async (request, reply) => {
    const { nodeId, choiceId } = request.body ?? {};
    if (typeof nodeId !== "string" || typeof choiceId !== "string") {
      return sendError(reply, 400, "INVALID_CHOICE_REQUEST", "nodeId 和 choiceId 必须是字符串。");
    }

    const result = await repository.submitChoice(
      request.params.chapterCode,
      nodeId,
      choiceId,
    );
    if (!result) {
      return sendError(reply, 404, "CHOICE_NOT_FOUND", "当前节点不存在该选项。");
    }

    return result;
  });
}
