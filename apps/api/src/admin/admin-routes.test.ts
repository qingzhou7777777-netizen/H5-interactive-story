import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type {
  AdminChapterDetailDto,
  AdminVideoAssetDto,
} from "@interactive-story/api-contracts";

import {
  AdminContentValidationError,
  type AdminContentRepository,
} from "./admin-content-repository.js";
import { registerAdminRoutes } from "./admin-routes.js";

const timestamp = "2026-09-20T08:00:00.000Z";

function createFixtureRepository(): AdminContentRepository {
  let asset: AdminVideoAssetDto = {
    id: "asset-db-id",
    code: "chapter01-node001",
    originalFilename: "Node001.mp4",
    objectKey: "test/chapter01/Node001.mp4",
    playbackUrl: "/media/chapter01/Node001.mp4",
    posterUrl: "/posters/node001.svg",
    mimeType: "video/mp4",
    fileSize: "76144",
    durationMs: 4000,
    width: 720,
    height: 1280,
    checksum: "checksum",
    videoCodec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    frameRate: 30,
    processingError: null,
    posterObjectKey: null,
    posterMimeType: null,
    posterFileSize: null,
    status: "ready",
    relatedNodes: [
      { chapterCode: "chapter-01", nodeId: "Node001", nodeTitle: "第一次见面" },
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  let chapter: AdminChapterDetailDto = {
    id: "chapter-db-id",
    code: "chapter-01",
    title: "第一次见面",
    description: "测试章节",
    status: "active",
    entryNodeId: "Node001",
    nodeCount: 2,
    story: { code: "ai-romance-demo", title: "互动剧情", status: "active" },
    character: { code: "lin-wan", name: "林晚", status: "active" },
    createdAt: timestamp,
    updatedAt: timestamp,
    nodes: [
      {
        id: "Node001",
        title: "第一次见面",
        message: null,
        type: "video",
        completionMode: "choices",
        status: "active",
        accessMode: "free",
        videoAssetId: "chapter01-node001",
        videoAssetStatus: "ready",
        nextNodeId: null,
        choices: [
          {
            id: "A",
            label: "接受邀请",
            sourceNodeId: "Node001",
            targetNodeId: "Ending002",
            sortOrder: 1,
            enabled: true,
          },
        ],
      },
      {
        id: "Ending002",
        title: "接受邀请",
        message: "测试结束",
        type: "ending",
        completionMode: "end",
        status: "active",
        accessMode: "free",
        videoAssetId: null,
        videoAssetStatus: null,
        nextNodeId: null,
        choices: [],
      },
    ],
  };

  return {
    async listVideoAssets() {
      return [asset];
    },
    async getVideoAsset(assetCode) {
      return assetCode === asset.code ? asset : null;
    },
    async updateVideoAsset(assetCode, input) {
      if (assetCode !== asset.code) {
        return null;
      }
      if (input.status === "ready" && input.playbackUrl === null) {
        throw new AdminContentValidationError(
          "READY_VIDEO_REQUIRES_URL",
          "READY 视频资源必须配置 video URL。",
        );
      }
      asset = {
        ...asset,
        ...(input.playbackUrl !== undefined ? { playbackUrl: input.playbackUrl } : {}),
        ...(input.posterUrl !== undefined ? { posterUrl: input.posterUrl } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      };
      return asset;
    },
    async listChapters() {
      const { nodes: _nodes, ...summary } = chapter;
      return [summary];
    },
    async getChapter(chapterCode) {
      return chapterCode === chapter.code ? chapter : null;
    },
    async updateChapterStatus(chapterCode, status) {
      if (chapterCode !== chapter.code) {
        return null;
      }
      if (status === "active" && chapter.entryNodeId === null) {
        throw new AdminContentValidationError(
          "CHAPTER_NOT_PUBLISHABLE",
          "章节无法发布。",
        );
      }
      chapter = { ...chapter, status };
      return chapter;
    },
  };
}

async function createApp(repository = createFixtureRepository()) {
  const app = Fastify();
  await registerAdminRoutes(app, repository);
  return app;
}

describe("Admin API", () => {
  it("lists and updates video assets", async () => {
    const app = await createApp();
    const listResponse = await app.inject({ method: "GET", url: "/v1/admin/video-assets" });
    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/admin/video-assets/chapter01-node001",
      payload: {
        playbackUrl: "https://cdn.example.com/node001.mp4",
        posterUrl: null,
        status: "ready",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({ code: "chapter01-node001", status: "ready" }),
    ]);
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      playbackUrl: "https://cdn.example.com/node001.mp4",
      posterUrl: null,
    });
    await app.close();
  });

  it("rejects invalid video URLs and unknown fields", async () => {
    const app = await createApp();
    const invalidUrl = await app.inject({
      method: "PATCH",
      url: "/v1/admin/video-assets/chapter01-node001",
      payload: { playbackUrl: "javascript:alert(1)" },
    });
    const unknownField = await app.inject({
      method: "PATCH",
      url: "/v1/admin/video-assets/chapter01-node001",
      payload: { objectKey: "unexpected" },
    });

    expect(invalidUrl.statusCode).toBe(400);
    expect(unknownField.statusCode).toBe(400);
    await app.close();
  });

  it("returns chapter summaries and the complete node/choice graph", async () => {
    const app = await createApp();
    const [listResponse, detailResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/admin/chapters" }),
      app.inject({ method: "GET", url: "/v1/admin/chapters/chapter-01" }),
    ]);

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([
      expect.objectContaining({ code: "chapter-01", nodeCount: 2 }),
    ]);
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      nodes: expect.arrayContaining([
        expect.objectContaining({
          id: "Node001",
          choices: [expect.objectContaining({ id: "A", targetNodeId: "Ending002" })],
        }),
      ]),
    });
    await app.close();
  });

  it("switches chapter status and validates the status value", async () => {
    const app = await createApp();
    const updateResponse = await app.inject({
      method: "PATCH",
      url: "/v1/admin/chapters/chapter-01/status",
      payload: { status: "draft" },
    });
    const invalidResponse = await app.inject({
      method: "PATCH",
      url: "/v1/admin/chapters/chapter-01/status",
      payload: { status: "published" },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ status: "draft" });
    expect(invalidResponse.statusCode).toBe(400);
    await app.close();
  });

  it("returns 409 when publication validation fails", async () => {
    const repository = createFixtureRepository();
    const originalGetChapter = repository.getChapter.bind(repository);
    repository.getChapter = async (chapterCode) => {
      const chapter = await originalGetChapter(chapterCode);
      return chapter ? { ...chapter, entryNodeId: null } : null;
    };
    repository.updateChapterStatus = async () => {
      throw new AdminContentValidationError(
        "CHAPTER_NOT_PUBLISHABLE",
        "章节无法发布：入口节点无效。",
      );
    };
    const app = await createApp(repository);
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/chapters/chapter-01/status",
      payload: { status: "active" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: { code: "CHAPTER_NOT_PUBLISHABLE" },
    });
    await app.close();
  });
});
