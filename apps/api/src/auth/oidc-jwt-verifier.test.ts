import {
  SignJWT,
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
  type JSONWebKeySet,
} from "jose";
import { beforeAll, describe, expect, it } from "vitest";

import { AccountAuthenticationError } from "./authentication.js";
import { OidcJwtVerifier } from "./oidc-jwt-verifier.js";

const issuer = "https://identity.example.com/";
const audience = "interactive-story-api";
const keyId = "test-key";

let privateKey: CryptoKey;
let localJwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  const publicJwk = await exportJWK(pair.publicKey);
  const jwks: JSONWebKeySet = {
    keys: [{ ...publicJwk, alg: "RS256", kid: keyId, use: "sig" }],
  };
  localJwks = createLocalJWKSet(jwks);
});

function createVerifier(
  overrides: Partial<ConstructorParameters<typeof OidcJwtVerifier>[0]> = {},
) {
  return new OidcJwtVerifier(
    {
      issuer,
      audience,
      jwksUrl: "https://identity.example.com/.well-known/jwks.json",
      algorithms: ["RS256"],
      ...overrides,
    },
    localJwks,
  );
}

async function signToken(
  claims: Record<string, unknown> = {},
  options: { tokenIssuer?: string; tokenAudience?: string; expiresIn?: string } = {},
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setSubject("external-user-123")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(privateKey);
}

async function expectAuthError(
  operation: Promise<unknown>,
  code: AccountAuthenticationError["code"],
) {
  await expect(operation).rejects.toMatchObject({
    name: "AccountAuthenticationError",
    code,
  });
}

describe("OIDC JWT verifier", () => {
  it("verifies signature and required OIDC claims", async () => {
    const identity = await createVerifier().verify(
      await signToken({
        email: "verified@example.com",
        email_verified: true,
      }),
    );

    expect(identity).toEqual({
      issuer,
      subject: "external-user-123",
      verifiedEmail: "verified@example.com",
    });
  });

  it("does not trust an unverified or malformed email claim", async () => {
    const unverified = await createVerifier().verify(
      await signToken({ email: "unverified@example.com" }),
    );
    const malformed = await createVerifier().verify(
      await signToken({ email: "not-an-email", email_verified: true }),
    );

    expect(unverified.verifiedEmail).toBeNull();
    expect(malformed.verifiedEmail).toBeNull();
  });

  it("rejects an incorrect issuer, audience, expiry, or missing subject", async () => {
    await expectAuthError(
      createVerifier().verify(
        await signToken({}, { tokenIssuer: "https://wrong.example.com/" }),
      ),
      "INVALID_ACCESS_TOKEN",
    );
    await expectAuthError(
      createVerifier().verify(
        await signToken({}, { tokenAudience: "wrong-audience" }),
      ),
      "INVALID_ACCESS_TOKEN",
    );
    await expectAuthError(
      createVerifier().verify(await signToken({}, { expiresIn: "-10s" })),
      "INVALID_ACCESS_TOKEN",
    );

    const withoutSubject = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(issuer)
      .setAudience(audience)
      .setExpirationTime("5m")
      .sign(privateKey);
    await expectAuthError(
      createVerifier().verify(withoutSubject),
      "INVALID_ACCESS_TOKEN",
    );
  });

  it("rejects an algorithm outside the explicit allowlist", async () => {
    await expectAuthError(
      createVerifier({ algorithms: ["ES256"] }).verify(await signToken()),
      "INVALID_ACCESS_TOKEN",
    );
  });

  it("reports JWKS outages as authentication unavailable", async () => {
    const unavailableResolver = async () => {
      throw new errors.JWKSTimeout();
    };
    const verifier = new OidcJwtVerifier(
      {
        issuer,
        audience,
        jwksUrl: "https://identity.example.com/.well-known/jwks.json",
        algorithms: ["RS256"],
      },
      unavailableResolver,
    );

    await expectAuthError(
      verifier.verify(await signToken()),
      "AUTHENTICATION_UNAVAILABLE",
    );
  });
});
