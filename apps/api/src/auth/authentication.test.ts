import { describe, expect, it, vi } from "vitest";

import {
  AccountAuthenticationService,
  type ExternalIdentityVerifier,
  type UserRepository,
} from "./authentication.js";

function createDependencies(options: { disabled?: boolean; repositoryFails?: boolean } = {}) {
  const verifier: ExternalIdentityVerifier = {
    verify: vi.fn().mockResolvedValue({
      issuer: "https://identity.example.com/",
      subject: "external-user-123",
      verifiedEmail: "verified@example.com",
    }),
  };
  const users: UserRepository = {
    upsertExternalIdentity: options.repositoryFails
      ? vi.fn().mockRejectedValue(new Error("database unavailable"))
      : vi.fn().mockResolvedValue({
          id: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
          email: "verified@example.com",
          status: options.disabled ? "DISABLED" : "ACTIVE",
        }),
  };
  return { verifier, users };
}

describe("Account authentication service", () => {
  it("maps a verified external identity to the internal user", async () => {
    const { verifier, users } = createDependencies();
    const service = new AccountAuthenticationService(verifier, users);

    await expect(service.authenticate("Bearer signed-token")).resolves.toEqual({
      userId: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: "verified@example.com",
      status: "active",
    });
    expect(verifier.verify).toHaveBeenCalledWith("signed-token");
    expect(users.upsertExternalIdentity).toHaveBeenCalledWith(
      {
        issuer: "https://identity.example.com/",
        subject: "external-user-123",
        verifiedEmail: "verified@example.com",
      },
      expect.any(Date),
    );
  });

  it("requires exactly one Bearer token", async () => {
    const { verifier, users } = createDependencies();
    const service = new AccountAuthenticationService(verifier, users);

    await expect(service.authenticate(undefined)).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    await expect(service.authenticate("Basic credentials")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    await expect(service.authenticate("Bearer one two")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    });
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it("rejects a disabled internal user", async () => {
    const { verifier, users } = createDependencies({ disabled: true });
    const service = new AccountAuthenticationService(verifier, users);

    await expect(service.authenticate("Bearer signed-token")).rejects.toMatchObject({
      code: "ACCOUNT_DISABLED",
      statusCode: 403,
    });
  });

  it("does not expose repository failures", async () => {
    const { verifier, users } = createDependencies({ repositoryFails: true });
    const service = new AccountAuthenticationService(verifier, users);

    await expect(service.authenticate("Bearer signed-token")).rejects.toMatchObject({
      code: "AUTHENTICATION_UNAVAILABLE",
      statusCode: 503,
    });
  });
});
