import {
  ChapterReleaseStatus,
  ContentStatus,
  Prisma,
  PrismaClient,
  UserChapterProgressStatus,
} from "@prisma/client";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccountStoryMapResponse,
  AccountStoryRunResponse,
  ChapterDto,
} from "@interactive-story/api-contracts";
import type { RuntimeStoryDefinition } from "@interactive-story/story-core";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "../auth/authentication.js";
import { PrismaStoryMapRepository } from "../story-map/prisma-story-map-repository.js";
import { registerStoryMapRoutes } from "../story-map/story-map-routes.js";
import { StoryMapService } from "../story-map/story-map-service.js";
import { PrismaStoryRunRepository } from "./prisma-story-run-repository.js";
import { registerStoryRunRoutes } from "./story-run-routes.js";
import { StoryRunService } from "./story-run-service.js";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);

interface TestFixture {
  prisma: PrismaClient;
  chapterCode: string;
  releaseId: string;
  storyCode: string;
  characterCode: string;
}

interface TestClient {
  app: FastifyInstance;
  userId: string;
  headers: { authorization: string };
  progressId: string;
  close(): Promise<void>;
}

describe.runIf(runDatabaseTests)("story exploration and replay database integration", () => {
  let fixture: TestFixture;

  beforeAll(async () => {
    fixture = await createFixture();
  });

  afterAll(async () => {
    await fixture.prisma.chapterRelease.deleteMany({
      where: { chapter: { code: fixture.chapterCode } },
    });
    await fixture.prisma.chapter.deleteMany({ where: { code: fixture.chapterCode } });
    await fixture.prisma.story.deleteMany({ where: { code: fixture.storyCode } });
    await fixture.prisma.character.deleteMany({
      where: { code: fixture.characterCode },
    });
    await fixture.prisma.$disconnect();
  });

  it("starts an independent exploration from Node002", async () => {
    const client = await createClient(fixture);
    try {
      const response = await startExploration(client, fixture, "Node002");
      expect(response.statusCode).toBe(200);
      expect(response.json<AccountStoryRunResponse>()).toMatchObject({
        run: {
          mode: "exploration",
          status: "active",
          version: 0,
          entryNodeCode: "Node002",
          currentNodeCode: "Node002",
        },
        engineSnapshot: {
          phase: "playing",
          currentNodeId: "Node002",
          history: ["Node002"],
        },
      });
    } finally {
      await client.close();
    }
  });

  it("starts an independent exploration from Node003", async () => {
    const client = await createClient(fixture);
    try {
      const response = await startExploration(client, fixture, "Node003");
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        run: { entryNodeCode: "Node003", currentNodeCode: "Node003" },
      });
    } finally {
      await client.close();
    }
  });

  it("rejects discovered but locked exploration nodes", async () => {
    const client = await createClient(fixture);
    try {
      const response = await startExploration(client, fixture, "NodeLocked");
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: "RUN_ENTRY_LOCKED" },
      });
      expect(await runCount(fixture, client)).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("rejects hidden and forged exploration nodes", async () => {
    const client = await createClient(fixture);
    try {
      const [hidden, forged] = await Promise.all([
        startExploration(client, fixture, "NodeHidden"),
        startExploration(client, fixture, "NodeForged"),
      ]);
      expect(hidden.statusCode).toBe(404);
      expect(forged.statusCode).toBe(404);
      expect(hidden.json()).toMatchObject({
        error: { code: "RUN_ENTRY_NOT_FOUND" },
      });
      expect(await runCount(fixture, client)).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("continues an exploration through completeVideo and selectChoice", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startExploration(client, fixture, "Node001");
      const run = started.json<AccountStoryRunResponse>();
      const video = await completeExplorationVideo(
        client,
        fixture,
        run.run.id,
        "Node001",
        0,
      );
      expect(video.statusCode).toBe(200);
      expect(video.json()).toMatchObject({
        run: { version: 1, currentNodeCode: "Node001" },
        engineSnapshot: { phase: "awaiting_choice" },
      });

      const choice = await client.app.inject({
        method: "POST",
        url: runUrl(fixture, run.run.id, "exploration-runs/choices"),
        headers: client.headers,
        payload: {
          sourceNodeCode: "Node001",
          choiceCode: "A",
          expectedRunVersion: 1,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(choice.statusCode).toBe(200);
      expect(choice.json()).toMatchObject({
        run: { version: 2, currentNodeCode: "Node002", status: "active" },
        engineSnapshot: { phase: "playing", currentNodeId: "Node002" },
      });
      expect(
        await fixture.prisma.userExplorationChoiceDecision.count({
          where: { explorationRunId: run.run.id },
        }),
      ).toBe(1);
      expect(
        await fixture.prisma.userChoiceDecision.count({
          where: { chapterProgressId: client.progressId },
        }),
      ).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("marks an explored node completed in Map without changing mainline", async () => {
    const client = await createClient(fixture);
    try {
      const mainlineBefore = await mainlineState(fixture, client);
      const started = await startExploration(client, fixture, "Node002");
      const run = started.json<AccountStoryRunResponse>();
      const completed = await completeExplorationVideo(
        client,
        fixture,
        run.run.id,
        "Node002",
        0,
      );
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({
        run: { status: "completed", version: 1, currentNodeCode: "Ending002" },
      });

      const map = await getMap(client, fixture);
      expect(findMapNode(map.json<AccountStoryMapResponse>(), "Node002")).toMatchObject({
        state: "completed",
        actions: { canExplore: true, canReplay: true },
      });
      expect(await mainlineState(fixture, client)).toEqual(mainlineBefore);
      expect(
        await fixture.prisma.userNodeProgress.count({
          where: { chapterProgressId: client.progressId },
        }),
      ).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("replays a completed node as one isolated video", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startReplay(client, fixture, "Node001");
      expect(started.statusCode).toBe(200);
      const run = started.json<AccountStoryRunResponse>();
      expect(run).toMatchObject({
        run: { mode: "replay", status: "active", currentNodeCode: "Node001" },
        engineSnapshot: { phase: "playing", history: ["Node001"] },
      });

      const completed = await completeReplayVideo(
        client,
        fixture,
        run.run.id,
        "Node001",
        0,
      );
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({
        run: { status: "completed", version: 1, currentNodeCode: "Node001" },
        engineSnapshot: {
          phase: "ended",
          currentNodeId: "Node001",
          history: ["Node001"],
        },
      });
    } finally {
      await client.close();
    }
  });

  it("rejects replay for an available but incomplete node", async () => {
    const client = await createClient(fixture);
    try {
      const response = await startReplay(client, fixture, "Node003");
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: { code: "RUN_ENTRY_NOT_COMPLETED" },
      });
    } finally {
      await client.close();
    }
  });

  it("keeps map discovery and unlock state unchanged after replay", async () => {
    const client = await createClient(fixture);
    try {
      const mapBefore = (await getMap(client, fixture)).json<AccountStoryMapResponse>();
      const started = await startReplay(client, fixture, "Node001");
      const run = started.json<AccountStoryRunResponse>();
      await completeReplayVideo(client, fixture, run.run.id, "Node001", 0);
      const mapAfter = (await getMap(client, fixture)).json<AccountStoryMapResponse>();
      expect(mapAfter).toEqual(mapBefore);
    } finally {
      await client.close();
    }
  });

  it("allows at most one ACTIVE run for one chapter progress", async () => {
    const client = await createClient(fixture);
    try {
      const [first, second] = await Promise.all([
        startExploration(client, fixture, "Node002"),
        startExploration(client, fixture, "Node003"),
      ]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      expect(
        [first, second].find((response) => response.statusCode === 409)?.json(),
      ).toMatchObject({ error: { code: "STORY_RUN_ALREADY_ACTIVE" } });
      expect(
        await fixture.prisma.userExplorationRun.count({
          where: { chapterProgressId: client.progressId, status: "ACTIVE" },
        }),
      ).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("restores the same ACTIVE run after refresh", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startExploration(client, fixture, "Node002");
      const expected = started.json<AccountStoryRunResponse>();
      const restored = await client.app.inject({
        method: "GET",
        url: runUrl(fixture, expected.run.id, "exploration-runs"),
        headers: client.headers,
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toEqual(expected);
    } finally {
      await client.close();
    }
  });

  it("abandons an ACTIVE exploration without blocking a later run", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startExploration(client, fixture, "Node002");
      const run = started.json<AccountStoryRunResponse>();
      const abandoned = await client.app.inject({
        method: "POST",
        url: runUrl(fixture, run.run.id, "exploration-runs/abandon"),
        headers: client.headers,
        payload: { expectedRunVersion: 0 },
      });
      expect(abandoned.statusCode).toBe(200);
      expect(abandoned.json()).toMatchObject({
        run: { status: "abandoned", version: 1 },
      });

      const next = await startExploration(client, fixture, "Node003");
      expect(next.statusCode).toBe(200);
    } finally {
      await client.close();
    }
  });

  it("rejects stale runVersion updates with optimistic locking", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startExploration(client, fixture, "Node001");
      const run = started.json<AccountStoryRunResponse>();
      await completeExplorationVideo(
        client,
        fixture,
        run.run.id,
        "Node001",
        0,
      );
      const stale = await client.app.inject({
        method: "POST",
        url: runUrl(fixture, run.run.id, "exploration-runs/choices"),
        headers: client.headers,
        payload: {
          sourceNodeCode: "Node001",
          choiceCode: "A",
          expectedRunVersion: 0,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json()).toMatchObject({
        error: { code: "STORY_RUN_VERSION_CONFLICT" },
      });
    } finally {
      await client.close();
    }
  });

  it("returns the same result for a repeated video requestKey", async () => {
    const client = await createClient(fixture);
    try {
      const started = await startExploration(client, fixture, "Node002");
      const run = started.json<AccountStoryRunResponse>();
      const requestKey = crypto.randomUUID();
      const first = await completeExplorationVideo(
        client,
        fixture,
        run.run.id,
        "Node002",
        0,
        requestKey,
      );
      const repeated = await completeExplorationVideo(
        client,
        fixture,
        run.run.id,
        "Node002",
        0,
        requestKey,
      );
      expect(first.statusCode).toBe(200);
      expect(repeated.statusCode).toBe(200);
      expect(repeated.json()).toEqual(first.json());
    } finally {
      await client.close();
    }
  });

  it("keeps request keys idempotent and run ownership private", async () => {
    const owner = await createClient(fixture);
    const stranger = await createClient(fixture);
    try {
      const requestKey = crypto.randomUUID();
      const first = await startExploration(owner, fixture, "Node002", requestKey);
      const repeated = await startExploration(owner, fixture, "Node002", requestKey);
      expect(repeated.statusCode).toBe(200);
      expect(repeated.json()).toEqual(first.json());

      const run = first.json<AccountStoryRunResponse>();
      const forbiddenRead = await stranger.app.inject({
        method: "GET",
        url: runUrl(fixture, run.run.id, "exploration-runs"),
        headers: stranger.headers,
      });
      expect(forbiddenRead.statusCode).toBe(404);
      expect(forbiddenRead.json()).toMatchObject({
        error: { code: "STORY_RUN_NOT_FOUND" },
      });
    } finally {
      await owner.close();
      await stranger.close();
    }
  });
});

async function createFixture(): Promise<TestFixture> {
  const prisma = new PrismaClient();
  const suffix = crypto.randomUUID();
  const storyCode = `run-story-${suffix}`;
  const characterCode = `run-character-${suffix}`;
  const chapterCode = `run-chapter-${suffix}`;
  const story = await prisma.story.create({
    data: { code: storyCode, title: "Run Story", status: ContentStatus.ACTIVE },
  });
  const character = await prisma.character.create({
    data: {
      code: characterCode,
      name: "Run Character",
      status: ContentStatus.ACTIVE,
    },
  });
  const chapter = await prisma.chapter.create({
    data: {
      code: chapterCode,
      title: "Run Chapter",
      storyId: story.id,
      characterId: character.id,
      status: ContentStatus.ACTIVE,
    },
  });

  const runtimeStory: RuntimeStoryDefinition = {
    id: `runtime-${suffix}`,
    title: "Run Chapter",
    entryNodeId: "Node001",
    nodes: {
      Node001: {
        id: "Node001",
        title: "入口",
        type: "video",
        onComplete: {
          type: "choices",
          choices: [
            { id: "A", label: "路线 A", targetNodeId: "Node002" },
            { id: "B", label: "路线 B", targetNodeId: "Node003" },
          ],
        },
      },
      Node002: {
        id: "Node002",
        title: "路线 A",
        type: "video",
        onComplete: { type: "next", targetNodeId: "Ending002" },
      },
      Node003: {
        id: "Node003",
        title: "路线 B",
        type: "video",
        onComplete: { type: "next", targetNodeId: "Ending003" },
      },
      NodeLocked: {
        id: "NodeLocked",
        title: "锁定节点",
        type: "video",
        onComplete: { type: "end" },
      },
      NodeHidden: {
        id: "NodeHidden",
        title: "隐藏节点",
        type: "video",
        onComplete: { type: "end" },
      },
      Ending002: { id: "Ending002", title: "A 结局", type: "ending" },
      Ending003: { id: "Ending003", title: "B 结局", type: "ending" },
    },
  };
  const chapterDto: ChapterDto = {
    id: chapter.id,
    code: chapterCode,
    title: chapter.title,
    description: null,
    entryNodeId: "Node001",
    story: { id: story.id, code: story.code, title: story.title, description: null },
    character: {
      code: character.code,
      name: character.name,
      avatarUrl: null,
      coverUrl: null,
      description: null,
    },
    nodes: [],
    videoAssets: [],
  };
  const release = await prisma.chapterRelease.create({
    data: {
      chapterId: chapter.id,
      version: 1,
      status: ChapterReleaseStatus.ACTIVE,
      snapshot: {
        schemaVersion: 1,
        chapter: chapterDto,
        runtimeStory,
      } as unknown as Prisma.InputJsonValue,
      contentHash: "d".repeat(64),
      publishedAt: new Date(),
    },
  });
  const region = await prisma.storyMapRegion.create({
    data: {
      chapterReleaseId: release.id,
      code: "run-region",
      title: "运行测试区域",
      sortOrder: 0,
    },
  });

  for (const [sortOrder, nodeCode] of [
    "Node001",
    "Node002",
    "Node003",
    "NodeLocked",
    "NodeHidden",
  ].entries()) {
    const mapNode = await prisma.storyMapNode.create({
      data: {
        chapterReleaseId: release.id,
        regionId: region.id,
        nodeCode,
        displayTitle: nodeCode,
        positionX: sortOrder * 100,
        positionY: 0,
        sortOrder,
        allowExploration: true,
        allowReplay: true,
      },
    });
    const discoveryDependsOnMissing = nodeCode === "NodeHidden";
    const unlockDependsOnMissing =
      nodeCode === "NodeLocked" || nodeCode === "NodeHidden";
    await prisma.nodePrerequisite.createMany({
      data: [
        discoveryDependsOnMissing
          ? {
              storyMapNodeId: mapNode.id,
              purpose: "DISCOVERY",
              groupCode: "discovery",
              factType: "NODE_COMPLETED",
              requiredNodeCode: "NodeMissing",
              sourceScope: "ANY",
              sortOrder: 0,
            }
          : nodeCode === "Node001" || nodeCode === "NodeLocked"
            ? {
                storyMapNodeId: mapNode.id,
                purpose: "DISCOVERY",
                groupCode: "discovery",
                factType: "CHAPTER_STARTED",
                sourceScope: "MAINLINE_ONLY",
                sortOrder: 0,
              }
            : {
                storyMapNodeId: mapNode.id,
                purpose: "DISCOVERY",
                groupCode: "discovery",
                factType: "NODE_COMPLETED",
                requiredNodeCode: "Node001",
                sourceScope: "MAINLINE_ONLY",
                sortOrder: 0,
              },
        unlockDependsOnMissing
          ? {
              storyMapNodeId: mapNode.id,
              purpose: "UNLOCK",
              groupCode: "unlock",
              factType: "NODE_COMPLETED",
              requiredNodeCode: "NodeMissing",
              sourceScope: "ANY",
              sortOrder: 0,
            }
          : nodeCode === "Node001"
            ? {
                storyMapNodeId: mapNode.id,
                purpose: "UNLOCK",
                groupCode: "unlock",
                factType: "CHAPTER_STARTED",
                sourceScope: "MAINLINE_ONLY",
                sortOrder: 0,
              }
            : {
                storyMapNodeId: mapNode.id,
                purpose: "UNLOCK",
                groupCode: "unlock",
                factType: "NODE_COMPLETED",
                requiredNodeCode: "Node001",
                sourceScope: "MAINLINE_ONLY",
                sortOrder: 0,
              },
      ],
    });
  }

  return {
    prisma,
    chapterCode,
    releaseId: release.id,
    storyCode,
    characterCode,
  };
}

async function createClient(fixture: TestFixture): Promise<TestClient> {
  const token = `run-token-${crypto.randomUUID()}`;
  const user = await fixture.prisma.user.create({
    data: {
      authIssuer: "https://story-run-integration.invalid/",
      authSubject: token,
    },
  });
  const now = new Date();
  const progress = await fixture.prisma.userChapterProgress.create({
    data: {
      userId: user.id,
      chapterReleaseId: fixture.releaseId,
      status: UserChapterProgressStatus.IN_PROGRESS,
      currentNodeCode: "Node001",
      canonicalSnapshot: {
        version: 1,
        storyId: "mainline-test",
        phase: "awaiting_choice",
        currentNodeId: "Node001",
        history: ["Node001"],
      },
      progressVersion: 7,
      nodeProgresses: {
        create: {
          nodeCode: "Node001",
          availableAt: now,
          firstStartedAt: now,
          firstCompletedAt: now,
          lastCompletedAt: now,
          completionCount: 1,
          lastPlayedAt: now,
        },
      },
    },
  });
  const authenticator: AccountAuthenticator = {
    async authenticate(header) {
      if (header !== `Bearer ${token}`) {
        throw new AccountAuthenticationError("AUTHENTICATION_REQUIRED", 401);
      }
      return { userId: user.id, email: null, status: "active" };
    },
  };
  const mapService = new StoryMapService(
    new PrismaStoryMapRepository(fixture.prisma),
  );
  const runService = new StoryRunService(
    new PrismaStoryRunRepository(fixture.prisma),
    mapService,
  );
  const app = Fastify({ logger: false });
  await registerStoryMapRoutes(app, authenticator, mapService);
  await registerStoryRunRoutes(app, authenticator, runService);

  return {
    app,
    userId: user.id,
    progressId: progress.id,
    headers: { authorization: `Bearer ${token}` },
    async close() {
      await app.close();
      await fixture.prisma.user.delete({ where: { id: user.id } });
    },
  };
}

function startExploration(
  client: TestClient,
  fixture: TestFixture,
  entryNodeCode: string,
  requestKey = crypto.randomUUID(),
) {
  return client.app.inject({
    method: "POST",
    url: `/v1/me/chapters/${fixture.chapterCode}/exploration-runs`,
    headers: client.headers,
    payload: { releaseId: fixture.releaseId, entryNodeCode, requestKey },
  });
}

function startReplay(
  client: TestClient,
  fixture: TestFixture,
  nodeCode: string,
) {
  return client.app.inject({
    method: "POST",
    url: `/v1/me/chapters/${fixture.chapterCode}/replay-runs`,
    headers: client.headers,
    payload: {
      releaseId: fixture.releaseId,
      nodeCode,
      requestKey: crypto.randomUUID(),
    },
  });
}

function completeExplorationVideo(
  client: TestClient,
  fixture: TestFixture,
  runId: string,
  nodeCode: string,
  expectedRunVersion: number,
  requestKey = crypto.randomUUID(),
) {
  return client.app.inject({
    method: "POST",
    url: runUrl(fixture, runId, "exploration-runs/video-completions"),
    headers: client.headers,
    payload: {
      nodeCode,
      expectedRunVersion,
      requestKey,
    },
  });
}

function completeReplayVideo(
  client: TestClient,
  fixture: TestFixture,
  runId: string,
  nodeCode: string,
  expectedRunVersion: number,
) {
  return client.app.inject({
    method: "POST",
    url: runUrl(fixture, runId, "replay-runs/video-completions"),
    headers: client.headers,
    payload: {
      nodeCode,
      expectedRunVersion,
      requestKey: crypto.randomUUID(),
    },
  });
}

function getMap(client: TestClient, fixture: TestFixture) {
  return client.app.inject({
    method: "GET",
    url: `/v1/me/chapters/${fixture.chapterCode}/map`,
    headers: client.headers,
  });
}

function runUrl(fixture: TestFixture, runId: string, suffix: string) {
  const [resource, operation] = suffix.split("/");
  return `/v1/me/chapters/${fixture.chapterCode}/${resource}/${runId}${operation ? `/${operation}` : ""}`;
}

function findMapNode(map: AccountStoryMapResponse, nodeCode: string) {
  return map.regions
    .flatMap((region) => region.nodes)
    .find((node) => node.nodeCode === nodeCode);
}

async function mainlineState(fixture: TestFixture, client: TestClient) {
  const progress = await fixture.prisma.userChapterProgress.findUniqueOrThrow({
    where: { id: client.progressId },
    select: {
      currentNodeCode: true,
      canonicalSnapshot: true,
      progressVersion: true,
      status: true,
    },
  });
  return JSON.parse(JSON.stringify(progress)) as unknown;
}

function runCount(fixture: TestFixture, client: TestClient) {
  return fixture.prisma.userExplorationRun.count({
    where: { chapterProgressId: client.progressId },
  });
}
