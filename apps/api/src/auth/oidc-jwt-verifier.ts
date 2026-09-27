import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

import {
  AccountAuthenticationError,
  type ExternalIdentityVerifier,
  type VerifiedExternalIdentity,
} from "./authentication.js";

export interface OidcJwtVerifierConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  algorithms: string[];
}

const unavailableJoseErrorCodes = new Set([
  "ERR_JOSE_GENERIC",
  "ERR_JWKS_INVALID",
  "ERR_JWKS_TIMEOUT",
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export class OidcJwtVerifier implements ExternalIdentityVerifier {
  private readonly keyResolver: JWTVerifyGetKey;

  constructor(
    private readonly config: OidcJwtVerifierConfig,
    keyResolver?: JWTVerifyGetKey,
  ) {
    this.keyResolver =
      keyResolver ??
      createRemoteJWKSet(new URL(config.jwksUrl), {
        timeoutDuration: 5_000,
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      });
  }

  async verify(token: string): Promise<VerifiedExternalIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: this.config.algorithms,
        requiredClaims: ["iss", "aud", "sub", "exp"],
        clockTolerance: 5,
      });

      if (
        typeof payload.iss !== "string" ||
        typeof payload.sub !== "string" ||
        payload.sub.trim() === ""
      ) {
        throw new AccountAuthenticationError("INVALID_ACCESS_TOKEN", 401);
      }

      return {
        issuer: payload.iss,
        subject: payload.sub,
        verifiedEmail: readVerifiedEmail(payload),
      };
    } catch (error) {
      if (error instanceof AccountAuthenticationError) {
        throw error;
      }
      if (error instanceof errors.JOSEError) {
        if (unavailableJoseErrorCodes.has(error.code)) {
          throw new AccountAuthenticationError(
            "AUTHENTICATION_UNAVAILABLE",
            503,
          );
        }
        throw new AccountAuthenticationError("INVALID_ACCESS_TOKEN", 401);
      }
      throw new AccountAuthenticationError(
        "AUTHENTICATION_UNAVAILABLE",
        503,
      );
    }
  }
}

function readVerifiedEmail(payload: Record<string, unknown>) {
  if (
    payload.email_verified !== true ||
    typeof payload.email !== "string"
  ) {
    return null;
  }

  const email = payload.email.trim();
  return email.length <= 320 && emailPattern.test(email) ? email : null;
}
