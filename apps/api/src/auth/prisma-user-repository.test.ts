import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { PrismaUserRepository } from "./prisma-user-repository.js";

describe("Prisma user repository", () => {
  it("atomically upserts by authIssuer and authSubject", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: "verified@example.com",
      status: "ACTIVE",
    });
    const repository = new PrismaUserRepository({
      user: { upsert },
    } as unknown as Pick<PrismaClient, "user">);
    const authenticatedAt = new Date("2026-09-24T00:00:00.000Z");

    await repository.upsertExternalIdentity(
      {
        issuer: "https://identity.example.com/",
        subject: "external-user-123",
        verifiedEmail: "verified@example.com",
      },
      authenticatedAt,
    );

    expect(upsert).toHaveBeenCalledWith({
      where: {
        authIssuer_authSubject: {
          authIssuer: "https://identity.example.com/",
          authSubject: "external-user-123",
        },
      },
      create: {
        authIssuer: "https://identity.example.com/",
        authSubject: "external-user-123",
        email: "verified@example.com",
        lastLoginAt: authenticatedAt,
      },
      update: {
        email: "verified@example.com",
        lastLoginAt: authenticatedAt,
      },
      select: {
        id: true,
        email: true,
        status: true,
      },
    });
  });

  it("does not clear an existing email from an unverified claim", async () => {
    const upsert = vi.fn().mockResolvedValue({
      id: "0a2a7fb8-a435-4d50-9c4f-70b6024fbf6f",
      email: "existing@example.com",
      status: "ACTIVE",
    });
    const repository = new PrismaUserRepository({
      user: { upsert },
    } as unknown as Pick<PrismaClient, "user">);

    await repository.upsertExternalIdentity(
      {
        issuer: "https://identity.example.com/",
        subject: "external-user-123",
        verifiedEmail: null,
      },
      new Date("2026-09-24T00:00:00.000Z"),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ email: null }),
        update: expect.not.objectContaining({ email: expect.anything() }),
      }),
    );
  });
});
