import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "../auth/authentication.js";
import { PrismaStoryContentRepository } from "../story/prisma-story-content-repository.js";
import { registerAccountProgressRoutes } from "./account-progress-routes.js";
import { AccountProgressService } from "./account-progress-service.js";
import { ChapterReleasePublisher } from "./chapter-release-publisher.js";
import { PrismaAccountProgressRepository } from "./prisma-account-progress-repository.js";

const runDatabaseTests = Boolean(process.env.DATABASE_URL);

describe.runIf(runDatabaseTests)("account progress database integration", () => {
  it("persists and restores one authenticated story across clients", async () => {
    const prisma = new PrismaClient();
    const authIssuer = "https://integration-test.invalid/";
    const authSubject = `progress-${crypto.randomUUID()}`;
    const user = await prisma.user.create({
      data: { authIssuer, authSubject, email: null },
    });
    const authenticator: AccountAuthenticator = {
      async authenticate(header) {
        if (header !== "Bearer integration-token") {
          throw new AccountAuthenticationError("AUTHENTICATION_REQUIRED", 401);
        }
        return { userId: user.id, email: null, status: "active" };
      },
    };

    try {
      await new ChapterReleasePublisher(
        prisma,
        new PrismaStoryContentRepository(prisma),
      ).publishInitialRelease("chapter-01");
      const createClient = async () => {
        const app = Fastify({ logger: false });
        await registerAccountProgressRoutes(
          app,
          authenticator,
          new AccountProgressService(new PrismaAccountProgressRepository(prisma)),
        );
        return app;
      };
      const headers = { authorization: "Bearer integration-token" };
      const firstClient = await createClient();

      const start = await firstClient.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/start",
        headers,
      });
      expect(start.statusCode).toBe(200);
      const started = start.json<{
        release: { id: string };
        progress: { version: number };
      }>();
      expect(await prisma.userChapterProgress.count({ where: { userId: user.id } })).toBe(1);

      const entryComplete = await firstClient.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/video-completions",
        headers,
        payload: {
          releaseId: started.release.id,
          nodeCode: "Node001",
          expectedProgressVersion: 0,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(entryComplete.statusCode).toBe(200);
      expect(entryComplete.json()).toMatchObject({
        progress: { version: 1, currentNodeCode: "Node001" },
        engineSnapshot: { phase: "awaiting_choice" },
      });

      const choice = await firstClient.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/choices",
        headers,
        payload: {
          releaseId: started.release.id,
          sourceNodeCode: "Node001",
          choiceCode: "A",
          expectedProgressVersion: 1,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(choice.statusCode).toBe(200);
      expect(choice.json()).toMatchObject({
        progress: { version: 2, currentNodeCode: "Node002" },
      });
      expect(
        await prisma.userChoiceDecision.count({
          where: { chapterProgress: { userId: user.id } },
        }),
      ).toBe(1);
      await firstClient.close();

      const secondClient = await createClient();
      const restored = await secondClient.inject({
        method: "GET",
        url: "/v1/me/chapters/chapter-01/progress",
        headers,
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({
        progress: { version: 2, currentNodeCode: "Node002" },
        engineSnapshot: { phase: "playing", currentNodeId: "Node002" },
      });

      const ending = await secondClient.inject({
        method: "POST",
        url: "/v1/me/chapters/chapter-01/video-completions",
        headers,
        payload: {
          releaseId: started.release.id,
          nodeCode: "Node002",
          expectedProgressVersion: 2,
          requestKey: crypto.randomUUID(),
        },
      });
      expect(ending.statusCode).toBe(200);
      expect(ending.json()).toMatchObject({
        progress: { version: 3, status: "completed", currentNodeCode: "Ending002" },
        engineSnapshot: { phase: "ended", currentNodeId: "Ending002" },
      });
      expect(
        await prisma.userNodeProgress.count({
          where: { chapterProgress: { userId: user.id } },
        }),
      ).toBe(3);
      await secondClient.close();
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.$disconnect();
    }
  });
});
