import {
  ChapterReleaseStatus,
  ContentStatus,
  PrismaClient,
  UserChapterProgressStatus,
} from "@prisma/client";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { AccountAuthenticator } from "../auth/authentication.js";
import { PrismaStoryMapRepository } from "./prisma-story-map-repository.js";
import { registerStoryMapRoutes } from "./story-map-routes.js";
import { StoryMapService } from "./story-map-service.js";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);

describe.runIf(runDatabaseTests)("story map database integration", () => {
  it("reads release-scoped map configuration and account facts", async () => {
    const prisma = new PrismaClient();
    const suffix = crypto.randomUUID();
    const storyCode = `map-story-${suffix}`;
    const characterCode = `map-character-${suffix}`;
    const chapterCode = `map-chapter-${suffix}`;
    const authIssuer = "https://story-map-integration.invalid/";
    const authSubject = `map-user-${suffix}`;

    try {
      const story = await prisma.story.create({
        data: {
          code: storyCode,
          title: "Story Map Integration",
          status: ContentStatus.ACTIVE,
        },
      });
      const character = await prisma.character.create({
        data: {
          code: characterCode,
          name: "Story Map Character",
          status: ContentStatus.ACTIVE,
        },
      });
      const chapter = await prisma.chapter.create({
        data: {
          code: chapterCode,
          title: "Story Map Chapter",
          storyId: story.id,
          characterId: character.id,
          status: ContentStatus.ACTIVE,
        },
      });
      const release = await prisma.chapterRelease.create({
        data: {
          chapterId: chapter.id,
          version: 1,
          status: ChapterReleaseStatus.ACTIVE,
          snapshot: { schemaVersion: 1 },
          contentHash: "b".repeat(64),
          publishedAt: new Date(),
        },
      });
      await prisma.storyMapRegion.create({
        data: {
          chapterReleaseId: release.id,
          code: "opening",
          title: "开场",
          sortOrder: 0,
          nodes: {
            create: {
              nodeCode: "Node001",
              displayTitle: "入口节点",
              positionX: 10,
              positionY: 20,
              sortOrder: 0,
              allowExploration: false,
              allowReplay: true,
            },
          },
        },
      });
      const user = await prisma.user.create({
        data: { authIssuer, authSubject },
      });
      const now = new Date();
      await prisma.userChapterProgress.create({
        data: {
          userId: user.id,
          chapterReleaseId: release.id,
          status: UserChapterProgressStatus.IN_PROGRESS,
          currentNodeCode: "Node001",
          canonicalSnapshot: { version: 1 },
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
        async authenticate() {
          return { userId: user.id, email: null, status: "active" };
        },
      };
      const app = Fastify({ logger: false });
      await registerStoryMapRoutes(
        app,
        authenticator,
        new StoryMapService(new PrismaStoryMapRepository(prisma)),
      );

      const response = await app.inject({
        method: "GET",
        url: `/v1/me/chapters/${chapterCode}/map`,
        headers: { authorization: "Bearer integration-token" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        release: { id: release.id, version: 1 },
        regions: [
          {
            code: "opening",
            nodes: [
              {
                nodeCode: "Node001",
                state: "completed",
                actions: { canExplore: false, canReplay: true },
              },
            ],
          },
        ],
      });
      await app.close();
    } finally {
      await prisma.user.deleteMany({ where: { authIssuer, authSubject } });
      await prisma.chapterRelease.deleteMany({
        where: { chapter: { code: chapterCode } },
      });
      await prisma.chapter.deleteMany({ where: { code: chapterCode } });
      await prisma.story.deleteMany({ where: { code: storyCode } });
      await prisma.character.deleteMany({ where: { code: characterCode } });
      await prisma.$disconnect();
    }
  });
});
