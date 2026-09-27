import { readFile } from "node:fs/promises";

const files = {
  environment: "deploy/production/.env.production.example",
  compose: "deploy/production/compose.production.yaml",
  gateway: "deploy/production/Caddyfile.gateway",
  tunnel: "deploy/production/cloudflared-config.example.yml",
  apiImage: "deploy/production/Dockerfile.api",
  initImage: "deploy/production/Dockerfile.init",
};

const content = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, path]) => [name, await readFile(path, "utf8")]),
  ),
);

const checks = [
  ["Public API host has an explicit Admin matcher", content.gateway.includes("path /v1/admin /v1/admin/*")],
  ["Public Admin route is denied before reverse proxy", content.gateway.includes("respond @admin_api 404")],
  ["Admin gateway requires the Access assertion header", content.gateway.includes("Cf-Access-Jwt-Assertion")],
  ["Admin without an Access assertion is denied", content.gateway.includes("respond @admin_without_access 403")],
  ["Admin tunnel requires cryptographic Access validation", /access:\s*[\s\S]*required:\s*true/.test(content.tunnel)],
  ["Tunnel has a deny-all final ingress rule", content.tunnel.includes("service: http_status:404")],
  ["API and gateway are not published with Docker ports", !/^\s{4}ports:/m.test(content.compose)],
  ["Cloudflared is opt-in rather than started by a local default", /cloudflared:[\s\S]*profiles:\s*\["tunnel"\]/.test(content.compose)],
  ["Initialization jobs are opt-in", /x-init-service:[\s\S]*profiles:\s*\["initialization"\]/.test(content.compose)],
  ["Runtime API image does not contain base Seed source", !content.apiImage.includes("database/seed.ts")],
  ["Dedicated initialization image contains base Seed source", content.initImage.includes("COPY database database")],
  ["Legacy public web container is not referenced", !content.compose.includes("Dockerfile.web")],
  ["Account progress is enabled in the production template", content.environment.includes("ACCOUNT_PROGRESS_ENABLED=true")],
  ["Auth0 RS256 verification is configured", content.environment.includes("AUTH_JWT_ALGORITHMS=RS256")],
  ["Production upload cap is 95 MiB", content.environment.includes("VIDEO_UPLOAD_MAX_BYTES=99614720")],
  ["Public API CORS is explicit", content.environment.includes("CORS_ORIGIN=https://bt-ik.top,https://admin.bt-ik.top")],
  ["Seed business rule remains an explicit confirmation", content.environment.includes("SEED_ACTIVE_PAYMENT_OFFER_CODES=USER_CONFIRMATION_REQUIRED")],
];

const failed = checks.filter(([, passed]) => !passed);
for (const [name, passed] of checks) {
  console.info(`${passed ? "PASS" : "FAIL"} ${name}`);
}
if (failed.length > 0) {
  throw new Error(`生产安全配置检查失败：${failed.map(([name]) => name).join("；")}`);
}

console.info("生产安全配置静态检查通过；Cloudflare Access和源站不可达性仍需Staging实测。");
