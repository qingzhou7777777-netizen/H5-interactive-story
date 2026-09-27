const DEFAULT_ANALYTICS_RATE_LIMIT_MAX = 120;
const DEFAULT_ANALYTICS_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;
const DEFAULT_AUTH_JWT_ALGORITHMS = ["RS256"];
const SUPPORTED_AUTH_JWT_ALGORITHMS = new Set([
  "RS256",
  "RS384",
  "RS512",
  "ES256",
  "ES384",
  "ES512",
]);

export interface AccountAuthRuntimeConfig {
  enabled: boolean;
  issuer: string | null;
  audience: string | null;
  jwksUrl: string | null;
  algorithms: string[];
}

export interface ApiRuntimeConfig {
  environment: string;
  isProduction: boolean;
  isTest: boolean;
  corsOrigins: string[];
  trustProxy: boolean;
  logLevel: string;
  bodyLimitBytes: number;
  requestTimeoutMs: number;
  shutdownTimeoutMs: number;
  analyticsRateLimitMax: number;
  analyticsRateLimitWindowMs: number;
  accountAuth: AccountAuthRuntimeConfig;
}

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数。`);
  }
  return parsed;
}

function readBoolean(
  value: string | undefined,
  fallback: boolean,
  name: string,
) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} 只能是 true 或 false。`);
}

function readCorsOrigins(value: string | undefined, isProduction: boolean) {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction && origins.length === 0) {
    throw new Error("生产环境必须配置 CORS_ORIGIN，且只能包含可信 HTTPS Origin。");
  }

  return origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGIN 包含无效 Origin：${origin}`);
    }
    if (url.origin !== origin || (isProduction && url.protocol !== "https:")) {
      throw new Error(`CORS_ORIGIN 必须是${isProduction ? " HTTPS" : ""} Origin，不能包含路径：${origin}`);
    }
    return origin;
  });
}

function readRequiredAuthUrl(
  value: string | undefined,
  name: string,
  isProduction: boolean,
) {
  if (!value?.trim()) {
    throw new Error(`启用账号认证时必须配置 ${name}。`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是有效 URL。`);
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    (isProduction && url.protocol !== "https:")
  ) {
    throw new Error(
      `${name} 必须是${isProduction ? " HTTPS" : " HTTP(S)"} URL，且不能包含凭据或片段。`,
    );
  }

  return value.trim();
}

function readAuthAlgorithms(value: string | undefined) {
  const algorithms = (value ?? DEFAULT_AUTH_JWT_ALGORITHMS.join(","))
    .split(",")
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);

  if (
    algorithms.length === 0 ||
    algorithms.some(
      (algorithm) => !SUPPORTED_AUTH_JWT_ALGORITHMS.has(algorithm),
    )
  ) {
    throw new Error(
      "AUTH_JWT_ALGORITHMS 只能包含受支持的非对称 JWT 算法。",
    );
  }

  return [...new Set(algorithms)];
}

function readAccountAuthConfig(
  env: NodeJS.ProcessEnv,
  isProduction: boolean,
): AccountAuthRuntimeConfig {
  const enabled = readBoolean(
    env.ACCOUNT_PROGRESS_ENABLED,
    false,
    "ACCOUNT_PROGRESS_ENABLED",
  );

  if (!enabled) {
    return {
      enabled: false,
      issuer: null,
      audience: null,
      jwksUrl: null,
      algorithms: [...DEFAULT_AUTH_JWT_ALGORITHMS],
    };
  }

  const algorithms = readAuthAlgorithms(env.AUTH_JWT_ALGORITHMS);
  const audience = env.AUTH_AUDIENCE?.trim();
  if (!audience) {
    throw new Error("启用账号认证时必须配置 AUTH_AUDIENCE。");
  }

  return {
    enabled: true,
    issuer: readRequiredAuthUrl(env.AUTH_ISSUER, "AUTH_ISSUER", isProduction),
    audience,
    jwksUrl: readRequiredAuthUrl(
      env.AUTH_JWKS_URL,
      "AUTH_JWKS_URL",
      isProduction,
    ),
    algorithms,
  };
}

export function readApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const environment = env.NODE_ENV ?? "development";
  const isProduction = environment === "production";

  return {
    environment,
    isProduction,
    isTest: environment === "test",
    corsOrigins: readCorsOrigins(env.CORS_ORIGIN, isProduction),
    trustProxy: readBoolean(env.TRUST_PROXY, isProduction, "TRUST_PROXY"),
    logLevel: env.LOG_LEVEL?.trim() || (isProduction ? "info" : "debug"),
    bodyLimitBytes: readPositiveInteger(
      env.API_BODY_LIMIT_BYTES,
      DEFAULT_BODY_LIMIT_BYTES,
      "API_BODY_LIMIT_BYTES",
    ),
    requestTimeoutMs: readPositiveInteger(
      env.API_REQUEST_TIMEOUT_MS,
      DEFAULT_REQUEST_TIMEOUT_MS,
      "API_REQUEST_TIMEOUT_MS",
    ),
    shutdownTimeoutMs: readPositiveInteger(
      env.API_SHUTDOWN_TIMEOUT_MS,
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      "API_SHUTDOWN_TIMEOUT_MS",
    ),
    analyticsRateLimitMax: readPositiveInteger(
      env.ANALYTICS_RATE_LIMIT_MAX,
      DEFAULT_ANALYTICS_RATE_LIMIT_MAX,
      "ANALYTICS_RATE_LIMIT_MAX",
    ),
    analyticsRateLimitWindowMs: readPositiveInteger(
      env.ANALYTICS_RATE_LIMIT_WINDOW_MS,
      DEFAULT_ANALYTICS_RATE_LIMIT_WINDOW_MS,
      "ANALYTICS_RATE_LIMIT_WINDOW_MS",
    ),
    accountAuth: readAccountAuthConfig(env, isProduction),
  };
}
