export interface VerifiedExternalIdentity {
  issuer: string;
  subject: string;
  verifiedEmail: string | null;
}

export interface ExternalIdentityVerifier {
  verify(token: string): Promise<VerifiedExternalIdentity>;
}

export interface EndUserRecord {
  id: string;
  email: string | null;
  status: "ACTIVE" | "DISABLED";
}

export interface UserRepository {
  upsertExternalIdentity(
    identity: VerifiedExternalIdentity,
    authenticatedAt: Date,
  ): Promise<EndUserRecord>;
}

export interface AuthenticatedAccount {
  userId: string;
  email: string | null;
  status: "active";
}

export interface AccountAuthenticator {
  authenticate(authorizationHeader: string | undefined): Promise<AuthenticatedAccount>;
}

export type AccountAuthenticationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "INVALID_ACCESS_TOKEN"
  | "ACCOUNT_DISABLED"
  | "AUTHENTICATION_UNAVAILABLE";

const errorMessages: Record<AccountAuthenticationErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "需要有效的 Bearer Token。",
  INVALID_ACCESS_TOKEN: "Access Token 无效或已过期。",
  ACCOUNT_DISABLED: "当前账号已被禁用。",
  AUTHENTICATION_UNAVAILABLE: "认证服务暂时不可用，请稍后重试。",
};

export class AccountAuthenticationError extends Error {
  constructor(
    public readonly code: AccountAuthenticationErrorCode,
    public readonly statusCode: 401 | 403 | 503,
  ) {
    super(errorMessages[code]);
    this.name = "AccountAuthenticationError";
  }
}

export class AccountAuthenticationService implements AccountAuthenticator {
  constructor(
    private readonly verifier: ExternalIdentityVerifier,
    private readonly users: UserRepository,
  ) {}

  async authenticate(authorizationHeader: string | undefined) {
    const token = parseBearerToken(authorizationHeader);
    const identity = await this.verifier.verify(token);

    let user: EndUserRecord;
    try {
      user = await this.users.upsertExternalIdentity(identity, new Date());
    } catch (error) {
      if (error instanceof AccountAuthenticationError) {
        throw error;
      }
      throw new AccountAuthenticationError(
        "AUTHENTICATION_UNAVAILABLE",
        503,
      );
    }

    if (user.status === "DISABLED") {
      throw new AccountAuthenticationError("ACCOUNT_DISABLED", 403);
    }

    return {
      userId: user.id,
      email: user.email,
      status: "active" as const,
    };
  }
}

function parseBearerToken(authorizationHeader: string | undefined) {
  if (!authorizationHeader) {
    throw new AccountAuthenticationError("AUTHENTICATION_REQUIRED", 401);
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorizationHeader);
  if (!match?.[1]) {
    throw new AccountAuthenticationError("AUTHENTICATION_REQUIRED", 401);
  }

  return match[1];
}
