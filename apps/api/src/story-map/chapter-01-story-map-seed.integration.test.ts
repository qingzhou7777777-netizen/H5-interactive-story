import {
  PrismaClient,
  UserExplorationRunMode,
  UserExplorationRunStatus,
} from "@prisma/client";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  AccountChapterProgressResponse,
  AccountStoryMapResponse,
} from "@interactive-story/api-contracts";

import { registerAccountProgressRoutes } from "../account-progress/account-progress-routes.js";
import { AccountProgressService } from "../account-progress/account-progress-service.js";
import { PrismaAccountProgressRepository } from "../account-progress/prisma-account-progress-repository.js";
import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "../auth/authentication.js";
import { Chapter01StoryMapSeeder } from "./chapter-01-story-map-seed.js";
import { PrismaStoryMapRepository } from "./prisma-story-map-repository.js";
import { registerStoryMapRoutes } from "./story-map-routes.js";
import { StoryMapService } from "./story-map-service.js";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);

interface AccountTestClient {
  app: FastifyInstance;
  userId: string;
  headers: { authorization: string };
  close(): Promise<void>;
}

describe.runIf(runDatabaseTests)("chapter-01 story map seed", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const first = await new Chapter01StoryMapSeeder(prisma).seed();
    const second = await new Chapter01StoryMapSeeder(prisma).seed();
    expect(first).toMatchObject({ regionCount: 1, nodeCount: 4, prerequisiteCount: 8 });
    expect(second).toMatchObject({ created: false, regionCount: 1, nodeCount: 4 });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("returns only Node001 after a new account starts chapter-01", async () => {
    const client = await createAccountClient(prisma);
    try {
      const beforeStart = await getMap(client);
      expect(beforeStart.statusCode).toBe(404);
      expect(beforeStart.json()).toMatchObject({
        error: { code: "CHAPTER_PROGRESS_NOT_FOUND" },
      });

      await startChapter(client);
      const map = await getMap(client);

      expect(map.statusCode).toBe(200);
      expect(map.json<AccountStoryMapResponse>()).toMatchObject({
        regions: [
          {
            code: "chapter-01-opening",
            nodes: [
              {
                nodeCode: "Node001",
                state: "available",
                actions: { canExplore: false, canReplay: false },
              },
            ],
          },
        ],
      });
    } finally {
      await client.close();
    }
  });

  it("discovers all branches after Node001 completes", async () => {
    const client = await createAccountClient(prisma);
    try {
      const started = await startChapter(client);
      await completeEntry(client, started);
      const map = await getMap(client);
      const nodes = mapNodes(map.json<AccountStoryMapResponse>());

      expect(nodes).toEqual({
        Node001: {
          state: "completed",
          actions: { canExplore: false, canReplay: true },
        },
        Node002: {
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
        Node003: {
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
        Node004: {
          state: "available",
          actions: { canExplore: true, canReplay: false },
        },
      });
    } finally {
      await client.close();
    }
  });

  it("keeps valid map states after the mainline selects route A", async () => {
    const client = await createAccountClient(prisma);
    try {
      const started = await startChapter(client);
      await completeEntry(client, started);
      const choice = await client.app.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/choices",
        headers: client.headers,
        payload: {
          releaseId: started.release.id,
          sourceNodeCode: "Node001",
          choiceCode: "A",
          expectedProgressVersion: 1,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(choice.statusCode).toBe(200);

      const map = await getMap(client);
      const body = map.json<AccountStoryMapResponse>();
      expect(body.progress.currentNodeCode).toBe("Node002");
      expect(mapNodes(body)).toMatchObject({
        Node001: { state: "completed" },
        Node002: { state: "available" },
        Node003: { state: "available" },
        Node004: { state: "available" },
      });
    } finally {
      await client.close();
    }
  });

  it("returns completed Node003 for a route B exploration run", async () => {
    const client = await createAccountClient(prisma);
    try {
      const started = await startChapter(client);
      await completeEntry(client, started);
      const progress = await prisma.userChapterProgress.findFirstOrThrow({
        where: { userId: client.userId, chapterReleaseId: started.release.id },
      });
      const now = new Date();
      const run = await prisma.userExplorationRun.create({
        data: {
          chapterProgressId: progress.id,
          mode: UserExplorationRunMode.EXPLORATION,
          status: UserExplorationRunStatus.COMPLETED,
          entryNodeCode: "Node001",
          currentNodeCode: "Node003",
          canonicalSnapshot: { version: 1, currentNodeId: "Node003" },
          startRequestKey: crypto.randomUUID(),
          startedAt: now,
          lastPlayedAt: now,
          completedAt: now,
        },
      });
      const sourceSession = await prisma.userNodePlaySession.create({
        data: {
          explorationRunId: run.id,
          nodeCode: "Node001",
          sequence: 1,
          enteredAt: now,
          completedAt: now,
        },
      });
      await prisma.userExplorationChoiceDecision.create({
        data: {
          explorationRunId: run.id,
          sourcePlaySessionId: sourceSession.id,
          sequence: 1,
          sourceNodeCode: "Node001",
          choiceCode: "B",
          targetNodeCode: "Node003",
          requestKey: crypto.randomUUID(),
          selectedAt: now,
        },
      });
      await prisma.userNodePlaySession.create({
        data: {
          explorationRunId: run.id,
          nodeCode: "Node003",
          sequence: 2,
          enteredAt: now,
          completedAt: now,
        },
      });

      const map = await getMap(client);
      expect(mapNodes(map.json<AccountStoryMapResponse>())).toMatchObject({
        Node003: {
          state: "completed",
          actions: { canExplore: true, canReplay: true },
        },
      });
    } finally {
      await client.close();
    }
  });
});

async function createAccountClient(prisma: PrismaClient): Promise<AccountTestClient> {
  const token = `map-token-${crypto.randomUUID()}`;
  const user = await prisma.user.create({
    data: {
      authIssuer: "https://chapter-01-map-test.invalid/",
      authSubject: token,
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
  const app = Fastify({ logger: false });
  await registerAccountProgressRoutes(
    app,
    authenticator,
    new AccountProgressService(new PrismaAccountProgressRepository(prisma)),
  );
  await registerStoryMapRoutes(
    app,
    authenticator,
    new StoryMapService(new PrismaStoryMapRepository(prisma)),
  );

  return {
    app,
    userId: user.id,
    headers: { authorization: `Bearer ${token}` },
    async close() {
      await app.close();
      await prisma.user.delete({ where: { id: user.id } });
    },
  };
}

async function startChapter(client: AccountTestClient) {
  const response = await client.app.inject({
    method: "POST",
    url: "/v1/me/chapters/chapter-01/start",
    headers: client.headers,
  });
  expect(response.statusCode).toBe(200);
  return response.json<AccountChapterProgressResponse>();
}

async function completeEntry(
  client: AccountTestClient,
  started: AccountChapterProgressResponse,
) {
  const response = await client.app.inject({
    method: "POST",
    url: "/v1/me/chapters/chapter-01/video-completions",
    headers: client.headers,
    payload: {
      releaseId: started.release.id,
      nodeCode: "Node001",
      expectedProgressVersion: 0,
      requestKey: crypto.randomUUID(),
    },
  });
  expect(response.statusCode).toBe(200);
}

function getMap(client: AccountTestClient) {
  return client.app.inject({
    method: "GET",
    url: "/v1/me/chapters/chapter-01/map",
    headers: client.headers,
  });
}

function mapNodes(response: AccountStoryMapResponse) {
  return Object.fromEntries(
    response.regions.flatMap((region) =>
      region.nodes.map((node) => [
        node.nodeCode,
        { state: node.state, actions: node.actions },
      ]),
    ),
  );
}
