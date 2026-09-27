import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerAuthRoutes } from "./auth-routes.js";
import {
  AccountAuthenticationError,
  type AccountAuthenticator,
} from "./authentication.js";

async function createApp(authenticator: AccountAuthenticator) {
  const app = Fastify({ logger: false });
  await registerAuthRoutes(app, authenticator);
  return app;
}

describe("account authentication routes", () => {
  it("returns only the internal current-user identity", async () => {
    const authenticate = vi.fn().mockResolvedValue({
      userId: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: "verified@example.com",
      status: "active",
    });
    const app = await createApp({ authenticate });

    const response = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: "Bearer signed-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      userId: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: "verified@example.com",
      status: "active",
    });
    expect(JSON.stringify(response.json())).not.toContain("authSubject");
    expect(JSON.stringify(response.json())).not.toContain("signed-token");
    expect(authenticate).toHaveBeenCalledWith("Bearer signed-token");
    await app.close();
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401],
    ["INVALID_ACCESS_TOKEN", 401],
    ["ACCOUNT_DISABLED", 403],
    ["AUTHENTICATION_UNAVAILABLE", 503],
  ] as const)("maps %s to HTTP %i", async (code, statusCode) => {
    const authenticate = vi.fn().mockRejectedValue(
      new AccountAuthenticationError(code, statusCode),
    );
    const app = await createApp({ authenticate });

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toMatchObject({ error: { code } });
    if (statusCode === 401) {
      expect(response.headers["www-authenticate"]).toBe(
        'Bearer realm="interactive-story-api"',
      );
    }
    await app.close();
  });

  it("does not expose unexpected authentication errors", async () => {
    const app = await createApp({
      authenticate: vi.fn().mockRejectedValue(new Error("secret failure")),
    });

    const response = await app.inject({ method: "GET", url: "/v1/me" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "AUTHENTICATION_UNAVAILABLE",
        message: "认证服务暂时不可用，请稍后重试。",
      },
    });
    expect(response.body).not.toContain("secret failure");
    await app.close();
  });
});
