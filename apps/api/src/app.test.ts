import { describe, expect, it, vi } from "vitest";

import type {
  AccountStoryRunResponse,
  AccountStoryMapResponse,
  ChapterDto,
} from "@interactive-story/api-contracts";

import type { AdminContentRepository } from "./admin/admin-content-repository.js";
import type { AnalyticsRepository } from "./analytics/analytics-repository.js";
import type { AccountProgressUseCase } from "./account-progress/account-progress-service.js";
import type { AccountAuthenticator } from "./auth/authentication.js";
import type { PaymentOfferRepository } from "./commercial-test/payment-offer-repository.js";
import type { VideoAssetUploadUseCase } from "./media/video-asset-upload-service.js";
import { buildApp } from "./app.js";
import { readApiRuntimeConfig, type ApiRuntimeConfig } from "./runtime-config.js";
import type { StoryContentRepository } from "./story/story-content-repository.js";
import type { StoryMapUseCase } from "./story-map/story-map-service.js";
import type { StoryRunUseCase } from "./story-run/story-run-service.js";

const chapter: ChapterDto = {
  id: "chapter-db-id",
  code: "chapter-01",
  title: "第一次见面",
  description: "API 测试章节",
  entryNodeId: "Node001",
  story: {
    id: "story-db-id",
    code: "ai-romance-demo",
    title: "AI 恋爱互动剧情",
    description: null,
  },
  character: {
    code: "lin-wan",
    name: "林晚",
    avatarUrl: null,
    coverUrl: null,
    description: null,
  },
  nodes: [
    {
      id: "Node001",
      title: "第一次见面",
      type: "video",
      completionMode: "choices",
      message: null,
      videoAssetId: "chapter01-node001",
      nextNodeId: null,
      accessMode: "free",
      choices: [
        {
          id: "A",
          label: "接受邀请",
          targetNodeId: "Node002",
          sortOrder: 1,
        },
      ],
    },
    {
      id: "Node002",
      title: "接受邀请",
      type: "video",
      completionMode: "next",
      message: null,
      videoAssetId: "chapter01-node002",
      nextNodeId: "Ending002",
      accessMode: "free",
      choices: [],
    },
    {
      id: "Ending002",
      title: "接受邀请",
      type: "ending",
      completionMode: "end",
      message: "测试结束。",
      videoAssetId: null,
      nextNodeId: null,
      accessMode: "free",
      choices: [],
    },
  ],
  videoAssets: [
    {
      id: "chapter01-node001",
      playbackUrl: "/media/chapter01/Node001.mp4",
      posterUrl: "/media/chapter01/Node001.jpg",
      mimeType: "video/mp4",
      durationMs: 5_000,
      width: 720,
      height: 1280,
    },
    {
      id: "chapter01-node002",
      playbackUrl: "/media/chapter01/Node002.mp4",
      posterUrl: "/media/chapter01/Node002.jpg",
      mimeType: "video/mp4",
      durationMs: 5_000,
      width: 720,
      height: 1280,
    },
  ],
};

function createRepository(): StoryContentRepository {
  return {
    async getChapter(chapterCode) {
      return chapterCode === chapter.code ? chapter : null;
    },
    async getNode(chapterCode, nodeId) {
      return chapterCode === chapter.code
        ? chapter.nodes.find((node) => node.id === nodeId) ?? null
        : null;
    },
    async getVideoAsset(assetId) {
      return chapter.videoAssets.find((asset) => asset.id === assetId) ?? null;
    },
    async submitChoice(chapterCode, nodeId, choiceId) {
      const node =
        chapterCode === chapter.code
          ? chapter.nodes.find((candidate) => candidate.id === nodeId)
          : null;
      const choice = node?.choices.find((candidate) => candidate.id === choiceId);

      return choice
        ? {
            accepted: true,
            sourceNodeId: nodeId,
            choiceId,
            targetNodeId: choice.targetNodeId,
          }
        : null;
    },
  };
}

function createAdminRepository(): AdminContentRepository {
  return {
    async listVideoAssets() {
      return [];
    },
    async getVideoAsset() {
      return null;
    },
    async updateVideoAsset() {
      return null;
    },
    async listChapters() {
      return [];
    },
    async getChapter() {
      return null;
    },
    async updateChapterStatus() {
      return null;
    },
  };
}

function createVideoAssetUploadService(): VideoAssetUploadUseCase {
  return {
    maxVideoBytes: 200 * 1024 * 1024,
    maxPosterBytes: 300 * 1024,
    async uploadVideo() {
      throw new Error("测试未调用上传服务。");
    },
    async uploadPoster() {
      throw new Error("测试未调用上传服务。");
    },
  };
}

function createAnalyticsRepository(): AnalyticsRepository {
  return {
    async createSession(input) {
      return {
        sessionKey: input.sessionKey,
        firstEnteredAt: "2026-09-20T00:00:00.000Z",
        lastSeenAt: "2026-09-20T00:00:00.000Z",
        endedAt: null,
        durationMs: 0,
      };
    },
    async updateActivity() {
      return null;
    },
    async recordEvent() {
      return null;
    },
    async getFunnel(query) {
      return {
        filters: {
          chapterCode: query.chapterCode ?? null,
          from: query.from ?? null,
          to: query.to ?? null,
          utmSource: query.utmSource ?? null,
        },
        sessions: 0,
        averageDurationMs: 0,
        summary: {
          landingViews: 0,
          landingCtaClicks: 0,
          landingCtaClickRate: 0,
          nodeEntered: 0,
          entryNodeCode: null,
          entryVideoCompletionRate: 0,
          endingCompleted: 0,
          endingCompletionRate: 0,
          paymentClicked: 0,
          paymentClickRate: 0,
          paymentSessionRate: 0,
        },
        steps: [],
        sources: [],
        nodes: [],
        choices: [],
      };
    },
  };
}

function createPaymentOfferRepository(): PaymentOfferRepository {
  return {
    async getActiveOffer() {
      return null;
    },
  };
}

function createStoryMapService(): StoryMapUseCase {
  const response: AccountStoryMapResponse = {
    release: { id: "release-1", version: 1 },
    progress: { status: "in_progress", currentNodeCode: "Node001" },
    regions: [],
  };
  return {
    async getMap() {
      return response;
    },
  };
}

function createStoryRunService(): StoryRunUseCase {
  const response: AccountStoryRunResponse = {
    release: { id: "23ec86dd-aa71-4f84-92bf-dfbe372d20f9", version: 1 },
    run: {
      id: "2d661068-751a-47ee-b003-cdfc69aec44a",
      mode: "exploration",
      status: "active",
      version: 0,
      entryNodeCode: "Node002",
      currentNodeCode: "Node002",
    },
    chapter,
    engineSnapshot: {
      version: 1,
      storyId: "chapter-01:exploration:Node002",
      phase: "playing",
      currentNodeId: "Node002",
      history: ["Node002"],
    },
  };
  return {
    async startExploration() {
      return response;
    },
    async getExplorationRun() {
      return response;
    },
    async completeExplorationVideo() {
      return response;
    },
    async selectExplorationChoice() {
      return response;
    },
    async abandonExplorationRun() {
      return response;
    },
    async startReplay() {
      return {
        ...response,
        run: { ...response.run, mode: "replay" },
      };
    },
    async completeReplayVideo() {
      return {
        ...response,
        run: { ...response.run, mode: "replay", status: "completed" },
      };
    },
  };
}

function createTestApp(
  runtimeConfig?: ApiRuntimeConfig,
  accountAuthenticator?: AccountAuthenticator,
  accountProgressService?: AccountProgressUseCase,
) {
  return buildApp({
    storyRepository: createRepository(),
    adminRepository: createAdminRepository(),
    videoAssetUploadService: createVideoAssetUploadService(),
    analyticsRepository: createAnalyticsRepository(),
    paymentOfferRepository: createPaymentOfferRepository(),
    storyMapService: createStoryMapService(),
    storyRunService: createStoryRunService(),
    ...(runtimeConfig ? { runtimeConfig } : {}),
    ...(accountAuthenticator ? { accountAuthenticator } : {}),
    ...(accountProgressService ? { accountProgressService } : {}),
  });
}

describe("API", () => {
  it("returns the service health status", async () => {
    const app = await createTestApp();
    const [response, live, ready] = await Promise.all([
      app.inject({ method: "GET", url: "/health" }),
      app.inject({ method: "GET", url: "/health/live" }),
      app.inject({ method: "GET", url: "/health/ready" }),
    ]);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        status: "ok",
        service: "interactive-story-api",
      }),
    );
    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toMatchObject({ checks: { database: "injected" } });
    await app.close();
  });

  it("rate limits analytics writes without limiting content reads", async () => {
    const runtimeConfig = readApiRuntimeConfig({
      NODE_ENV: "test",
      ANALYTICS_RATE_LIMIT_MAX: "2",
      ANALYTICS_RATE_LIMIT_WINDOW_MS: "60000",
    });
    const app = await createTestApp(runtimeConfig);
    const payload = {
      sessionKey: "d1251db3-f3db-4c48-8dc4-0df062e68654",
      landingPath: "/",
    };
    const first = await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload,
    });
    const limited = await app.inject({
      method: "POST",
      url: "/v1/analytics/sessions",
      payload,
    });
    const chapterResponse = await app.inject({
      method: "GET",
      url: "/v1/chapters/chapter-01",
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(limited.statusCode).toBe(429);
    expect(chapterResponse.statusCode).toBe(200);
    await app.close();
  });

  it("returns a complete chapter graph", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/v1/chapters/chapter-01",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      code: "chapter-01",
      entryNodeId: "Node001",
      nodes: expect.arrayContaining([
        expect.objectContaining({ id: "Node001", type: "video" }),
      ]),
    });
    await app.close();
  });

  it("returns one node and one video asset", async () => {
    const app = await createTestApp();
    const [nodeResponse, videoResponse] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/v1/chapters/chapter-01/nodes/Node002",
      }),
      app.inject({
        method: "GET",
        url: "/v1/video-assets/chapter01-node002",
      }),
    ]);

    expect(nodeResponse.statusCode).toBe(200);
    expect(nodeResponse.json()).toMatchObject({
      id: "Node002",
      nextNodeId: "Ending002",
    });
    expect(videoResponse.statusCode).toBe(200);
    expect(videoResponse.json()).toMatchObject({
      id: "chapter01-node002",
      mimeType: "video/mp4",
    });
    await app.close();
  });

  it("validates and submits a choice without a user account", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/chapters/chapter-01/choices",
      payload: { nodeId: "Node001", choiceId: "A" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      accepted: true,
      sourceNodeId: "Node001",
      choiceId: "A",
      targetNodeId: "Node002",
    });
    await app.close();
  });

  it("keeps account routes disabled without affecting public content", async () => {
    const app = await createTestApp();
    const [accountResponse, chapterResponse] = await Promise.all([
      app.inject({ method: "GET", url: "/v1/me" }),
      app.inject({ method: "GET", url: "/v1/chapters/chapter-01" }),
    ]);

    expect(accountResponse.statusCode).toBe(404);
    expect(chapterResponse.statusCode).toBe(200);
    await app.close();
  });

  it("registers the account route without protecting public content", async () => {
    const runtimeConfig = readApiRuntimeConfig({
      NODE_ENV: "test",
      ACCOUNT_PROGRESS_ENABLED: "true",
      AUTH_ISSUER: "https://identity.example.com/",
      AUTH_AUDIENCE: "interactive-story-api",
      AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
    });
    const authenticate = vi.fn().mockResolvedValue({
      userId: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: null,
      status: "active",
    });
    const accountProgressService: AccountProgressUseCase = {
      getProgress: vi.fn(),
      startChapter: vi.fn(),
      completeVideo: vi.fn(),
      selectChoice: vi.fn(),
    };
    const app = await createTestApp(
      runtimeConfig,
      { authenticate },
      accountProgressService,
    );

    const [accountResponse, mapResponse, runResponse, chapterResponse] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { authorization: "Bearer signed-token" },
      }),
      app.inject({
        method: "GET",
        url: "/v1/me/chapters/chapter-01/map",
        headers: { authorization: "Bearer signed-token" },
      }),
      app.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/exploration-runs",
        headers: { authorization: "Bearer signed-token" },
        payload: {
          releaseId: "23ec86dd-aa71-4f84-92bf-dfbe372d20f9",
          entryNodeCode: "Node002",
          requestKey: "dbb74866-e21e-4c7c-b846-22b39ee01c96",
        },
      }),
      app.inject({ method: "GET", url: "/v1/chapters/chapter-01" }),
    ]);

    expect(accountResponse.statusCode).toBe(200);
    expect(accountResponse.json()).toMatchObject({
      userId: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      status: "active",
    });
    expect(mapResponse.statusCode).toBe(200);
    expect(mapResponse.json()).toMatchObject({
      release: { id: "release-1", version: 1 },
      regions: [],
    });
    expect(runResponse.statusCode).toBe(200);
    expect(runResponse.json()).toMatchObject({
      run: { mode: "exploration", entryNodeCode: "Node002" },
    });
    expect(chapterResponse.statusCode).toBe(200);
    expect(authenticate).toHaveBeenCalledWith("Bearer signed-token");
    await app.close();
  });

  it("rejects an unavailable choice", async () => {
    const app = await createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/v1/chapters/chapter-01/choices",
      payload: { nodeId: "Node001", choiceId: "missing" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "CHOICE_NOT_FOUND" },
    });
    await app.close();
  });
});
