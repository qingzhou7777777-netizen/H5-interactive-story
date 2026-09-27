import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { AccountChapterProgressResponse } from "@interactive-story/api-contracts";

import type { AccountAuthenticator } from "../auth/authentication.js";
import { registerAccountProgressRoutes } from "./account-progress-routes.js";
import type { AccountProgressUseCase } from "./account-progress-service.js";

const response: AccountChapterProgressResponse = {
  release: { id: "6a0a0b8b-f0a2-47e2-9075-b175b635443f", version: 1 },
  progress: { version: 0, status: "in_progress", currentNodeCode: "Node001" },
  chapter: {
    id: "chapter-id",
    code: "chapter-01",
    title: "章节",
    description: null,
    entryNodeId: "Node001",
    story: { id: "story-id", code: "story", title: "故事", description: null },
    character: {
      code: "character",
      name: "角色",
      avatarUrl: null,
      coverUrl: null,
      description: null,
    },
    nodes: [],
    videoAssets: [],
  },
  engineSnapshot: {
    version: 1,
    storyId: "story:chapter-01",
    phase: "playing",
    currentNodeId: "Node001",
    history: ["Node001"],
  },
};

function createDependencies() {
  const authenticator: AccountAuthenticator = {
    authenticate: vi.fn().mockResolvedValue({
      userId: "user-1",
      email: null,
      status: "active",
    }),
  };
  const progress: AccountProgressUseCase = {
    getProgress: vi.fn().mockResolvedValue(response),
    startChapter: vi.fn().mockResolvedValue(response),
    completeVideo: vi.fn().mockResolvedValue(response),
    selectChoice: vi.fn().mockResolvedValue(response),
  };
  return { authenticator, progress };
}

describe("account progress routes", () => {
  it("authenticates and starts a chapter for the internal user", async () => {
    const { authenticator, progress } = createDependencies();
    const app = Fastify({ logger: false });
    await registerAccountProgressRoutes(app, authenticator, progress);

    const result = await app.inject({
      method: "POST",
      url: "/v1/me/chapters/chapter-01/start",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({
      progress: { currentNodeCode: "Node001" },
    });
    expect(progress.startChapter).toHaveBeenCalledWith("user-1", "chapter-01");
    await app.close();
  });

  it("validates video and choice mutation requests", async () => {
    const { authenticator, progress } = createDependencies();
    const app = Fastify({ logger: false });
    await registerAccountProgressRoutes(app, authenticator, progress);

    const invalidVideo = await app.inject({
      method: "POST",
      url: "/v1/me/chapters/chapter-01/video-completions",
      payload: {},
    });
    const validChoice = await app.inject({
      method: "POST",
      url: "/v1/me/chapters/chapter-01/choices",
      headers: { authorization: "Bearer signed-token" },
      payload: {
        releaseId: "6a0a0b8b-f0a2-47e2-9075-b175b635443f",
        sourceNodeCode: "Node001",
        choiceCode: "A",
        expectedProgressVersion: 1,
        requestKey: "79baae8c-c2e0-473b-a451-b410961c98fb",
      },
    });

    expect(invalidVideo.statusCode).toBe(400);
    expect(validChoice.statusCode).toBe(200);
    expect(progress.selectChoice).toHaveBeenCalledWith(
      "user-1",
      "chapter-01",
      expect.objectContaining({ choiceCode: "A" }),
    );
    await app.close();
  });
});
