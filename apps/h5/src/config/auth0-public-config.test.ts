import { describe, expect, it } from "vitest";

import { readOptionalAuth0PublicConfig } from "./auth0-public-config";

const valid = {
  VITE_AUTH0_DOMAIN: "story-production.example.auth0.com",
  VITE_AUTH0_CLIENT_ID: "PUBLIC_SPA_CLIENT_ID",
  VITE_AUTH0_AUDIENCE: "https://api.bt-ik.top",
  VITE_AUTH_CALLBACK_URL: "https://bt-ik.top/auth/callback",
  VITE_AUTH_LOGOUT_URL: "https://bt-ik.top",
};

describe("readOptionalAuth0PublicConfig", () => {
  it("allows account authentication to remain unconfigured until the OIDC UI stage", () => {
    expect(readOptionalAuth0PublicConfig({})).toBeNull();
  });

  it("reads a complete public Auth0 SPA configuration", () => {
    expect(readOptionalAuth0PublicConfig(valid)).toEqual({
      domain: "story-production.example.auth0.com",
      clientId: "PUBLIC_SPA_CLIENT_ID",
      audience: "https://api.bt-ik.top/",
      callbackUrl: "https://bt-ik.top/auth/callback",
      logoutUrl: "https://bt-ik.top/",
    });
  });

  it("rejects partial configuration", () => {
    expect(() =>
      readOptionalAuth0PublicConfig({ VITE_AUTH0_DOMAIN: valid.VITE_AUTH0_DOMAIN }),
    ).toThrow("配置不完整");
  });

  it("rejects secrets or URL paths in the Auth0 domain field", () => {
    expect(() =>
      readOptionalAuth0PublicConfig({
        ...valid,
        VITE_AUTH0_DOMAIN: "https://story-production.example.auth0.com/oauth",
      }),
    ).toThrow("只能填写 Auth0 Hostname");
  });
});
