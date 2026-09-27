import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import type { AccountStoryMapResponse } from "@interactive-story/api-contracts";

import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "../auth/authentication.js";
import { registerStoryMapRoutes } from "./story-map-routes.js";
import {
  StoryMapError,
  type StoryMapUseCase,
} from "./story-map-service.js";

const mapResponse: AccountStoryMapResponse = {
  release: { id: "release-1", version: 1 },
  progress: { status: "in_progress", currentNodeCode: "Node001" },
  regions: [
    {
      code: "opening",
      title: "开场",
      description: null,
      sortOrder: 0,
      layoutMetadata: null,
      nodes: [
        {
          nodeCode: "Node001",
          title: "入口",
          description: null,
          coverUrl: null,
          position: { x: 0, y: 0 },
          sortOrder: 0,
          state: "available",
          actions: { canExplore: false, canReplay: false },
        },
      ],
    },
  ],
};

describe("story map routes", () => {
  it("authenticates and returns the account map", async () => {
    const authenticator: AccountAuthenticator = {
      authenticate: vi.fn().mockResolvedValue({
        userId: "user-1",
        email: null,
        status: "active",
      }),
    };
    const storyMap: StoryMapUseCase = {
      getMap: vi.fn().mockResolvedValue(mapResponse),
    };
    const app = Fastify({ logger: false });
    await registerStoryMapRoutes(app, authenticator, storyMap);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/chapters/chapter-01/map",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(mapResponse);
    expect(storyMap.getMap).toHaveBeenCalledWith("user-1", "chapter-01");
    await app.close();
  });

  it("returns 404 when the account has not started the chapter", async () => {
    const authenticator: AccountAuthenticator = {
      authenticate: vi.fn().mockResolvedValue({
        userId: "user-1",
        email: null,
        status: "active",
      }),
    };
    const storyMap: StoryMapUseCase = {
      getMap: vi
        .fn()
        .mockRejectedValue(
          new StoryMapError("CHAPTER_PROGRESS_NOT_FOUND", 404),
        ),
    };
    const app = Fastify({ logger: false });
    await registerStoryMapRoutes(app, authenticator, storyMap);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/chapters/chapter-01/map",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: { code: "CHAPTER_PROGRESS_NOT_FOUND" },
    });
    await app.close();
  });

  it("keeps the map private when authentication is missing", async () => {
    const authenticator: AccountAuthenticator = {
      authenticate: vi
        .fn()
        .mockRejectedValue(
          new AccountAuthenticationError("AUTHENTICATION_REQUIRED", 401),
        ),
    };
    const storyMap: StoryMapUseCase = { getMap: vi.fn() };
    const app = Fastify({ logger: false });
    await registerStoryMapRoutes(app, authenticator, storyMap);

    const response = await app.inject({
      method: "GET",
      url: "/v1/me/chapters/chapter-01/map",
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["www-authenticate"]).toContain("Bearer");
    expect(storyMap.getMap).not.toHaveBeenCalled();
    await app.close();
  });
});
