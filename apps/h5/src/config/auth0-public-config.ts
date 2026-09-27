export interface Auth0PublicConfig {
  domain: string;
  clientId: string;
  audience: string;
  callbackUrl: string;
  logoutUrl: string;
}

export interface Auth0PublicEnv {
  VITE_AUTH0_DOMAIN?: string;
  VITE_AUTH0_CLIENT_ID?: string;
  VITE_AUTH0_AUDIENCE?: string;
  VITE_AUTH_CALLBACK_URL?: string;
  VITE_AUTH_LOGOUT_URL?: string;
}

const AUTH0_VARIABLES = [
  "VITE_AUTH0_DOMAIN",
  "VITE_AUTH0_CLIENT_ID",
  "VITE_AUTH0_AUDIENCE",
  "VITE_AUTH_CALLBACK_URL",
  "VITE_AUTH_LOGOUT_URL",
] as const satisfies readonly (keyof Auth0PublicEnv)[];

function requiredValue(env: Auth0PublicEnv, name: keyof Auth0PublicEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`缺少 ${name}。`);
  return value;
}

function readAuth0Domain(value: string) {
  if (value.includes("://") || value.includes("/") || value.includes("#") || value.includes("?")) {
    throw new Error("VITE_AUTH0_DOMAIN 只能填写 Auth0 Hostname，不能包含协议或路径。");
  }
  const url = new URL(`https://${value}`);
  if (url.hostname !== value || url.port) {
    throw new Error("VITE_AUTH0_DOMAIN 不是有效的 Auth0 Hostname。");
  }
  return value;
}

function readHttpsUrl(value: string, name: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是有效 URL。`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`${name} 必须是无凭据、无片段的 HTTPS URL。`);
  }
  return url.toString();
}

export function readOptionalAuth0PublicConfig(
  env: Auth0PublicEnv = import.meta.env,
): Auth0PublicConfig | null {
  const configuredCount = AUTH0_VARIABLES.filter((name) => env[name]?.trim()).length;
  if (configuredCount === 0) return null;
  if (configuredCount !== AUTH0_VARIABLES.length) {
    throw new Error("Auth0 Public配置不完整，必须同时配置全部 VITE_AUTH* 变量。");
  }

  return {
    domain: readAuth0Domain(requiredValue(env, "VITE_AUTH0_DOMAIN")),
    clientId: requiredValue(env, "VITE_AUTH0_CLIENT_ID"),
    audience: readHttpsUrl(
      requiredValue(env, "VITE_AUTH0_AUDIENCE"),
      "VITE_AUTH0_AUDIENCE",
    ),
    callbackUrl: readHttpsUrl(
      requiredValue(env, "VITE_AUTH_CALLBACK_URL"),
      "VITE_AUTH_CALLBACK_URL",
    ),
    logoutUrl: readHttpsUrl(
      requiredValue(env, "VITE_AUTH_LOGOUT_URL"),
      "VITE_AUTH_LOGOUT_URL",
    ),
  };
}
