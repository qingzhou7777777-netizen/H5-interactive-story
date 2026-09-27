import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  UserRepository,
  VerifiedExternalIdentity,
} from "./authentication.js";

type PrismaUserClient = Pick<PrismaClient, "user">;

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaUserClient) {}

  async upsertExternalIdentity(
    identity: VerifiedExternalIdentity,
    authenticatedAt: Date,
  ) {
    const update: Prisma.UserUpdateInput = {
      lastLoginAt: authenticatedAt,
      ...(identity.verifiedEmail === null
        ? {}
        : { email: identity.verifiedEmail }),
    };

    return this.prisma.user.upsert({
      where: {
        authIssuer_authSubject: {
          authIssuer: identity.issuer,
          authSubject: identity.subject,
        },
      },
      create: {
        authIssuer: identity.issuer,
        authSubject: identity.subject,
        email: identity.verifiedEmail,
        lastLoginAt: authenticatedAt,
      },
      update,
      select: {
        id: true,
        email: true,
        status: true,
      },
    });
  }
}
