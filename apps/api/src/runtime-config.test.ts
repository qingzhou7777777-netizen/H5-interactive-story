import { describe, expect, it } from "vitest";

import { readApiRuntimeConfig } from "./runtime-config.js";

describe("API runtime config", () => {
  it("requires an explicit HTTPS CORS allowlist in production", () => {
    expect(() => readApiRuntimeConfig({ NODE_ENV: "production" })).toThrow(
      "生产环境必须配置 CORS_ORIGIN",
    );
    expect(() =>
      readApiRuntimeConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "http://story.example.com",
      }),
    ).toThrow("HTTPS Origin");
  });

  it("parses production safety and rate-limit settings", () => {
    const config = readApiRuntimeConfig({
      NODE_ENV: "production",
      CORS_ORIGIN: "https://story.example.com",
      TRUST_PROXY: "true",
      ANALYTICS_RATE_LIMIT_MAX: "60",
      ANALYTICS_RATE_LIMIT_WINDOW_MS: "30000",
    });

    expect(config).toMatchObject({
      corsOrigins: ["https://story.example.com"],
      trustProxy: true,
      analyticsRateLimitMax: 60,
      analyticsRateLimitWindowMs: 30_000,
      accountAuth: {
        enabled: false,
        issuer: null,
        audience: null,
        jwksUrl: null,
        algorithms: ["RS256"],
      },
    });
  });

  it("keeps account authentication disabled without OIDC settings", () => {
    expect(
      readApiRuntimeConfig({
        NODE_ENV: "test",
        ACCOUNT_PROGRESS_ENABLED: "false",
        AUTH_JWT_ALGORITHMS: "HS256",
      }).accountAuth,
    ).toEqual({
      enabled: false,
      issuer: null,
      audience: null,
      jwksUrl: null,
      algorithms: ["RS256"],
    });
  });

  it("requires complete OIDC settings when account authentication is enabled", () => {
    expect(() =>
      readApiRuntimeConfig({
        NODE_ENV: "test",
        ACCOUNT_PROGRESS_ENABLED: "true",
      }),
    ).toThrow("AUTH_AUDIENCE");

    const config = readApiRuntimeConfig({
      NODE_ENV: "test",
      ACCOUNT_PROGRESS_ENABLED: "true",
      AUTH_ISSUER: "https://identity.example.com/",
      AUTH_AUDIENCE: "interactive-story-api",
      AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
      AUTH_JWT_ALGORITHMS: "RS256,ES256,RS256",
    });

    expect(config.accountAuth).toEqual({
      enabled: true,
      issuer: "https://identity.example.com/",
      audience: "interactive-story-api",
      jwksUrl: "https://identity.example.com/.well-known/jwks.json",
      algorithms: ["RS256", "ES256"],
    });
  });

  it("rejects insecure production OIDC URLs and symmetric algorithms", () => {
    expect(() =>
      readApiRuntimeConfig({
        NODE_ENV: "production",
        CORS_ORIGIN: "https://story.example.com",
        ACCOUNT_PROGRESS_ENABLED: "true",
        AUTH_ISSUER: "http://identity.example.com/",
        AUTH_AUDIENCE: "interactive-story-api",
        AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
      }),
    ).toThrow("AUTH_ISSUER 必须是 HTTPS URL");

    expect(() =>
      readApiRuntimeConfig({
        NODE_ENV: "test",
        ACCOUNT_PROGRESS_ENABLED: "true",
        AUTH_ISSUER: "https://identity.example.com/",
        AUTH_AUDIENCE: "interactive-story-api",
        AUTH_JWKS_URL: "https://identity.example.com/.well-known/jwks.json",
        AUTH_JWT_ALGORITHMS: "HS256",
      }),
    ).toThrow("非对称 JWT 算法");
  });
});
