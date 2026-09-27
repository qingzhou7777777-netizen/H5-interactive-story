import { spawnSync } from "node:child_process";

const step = process.argv[2];
const extraArguments = process.argv.slice(3);
const chapterCode = extraArguments[0] ?? "chapter-01";

const commands = {
  migrate: {
    executable: "node",
    arguments: [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "database/schema.prisma",
    ],
  },
  seed: {
    executable: "node",
    arguments: ["database/dist/seed.js"],
    environment: { SEED_EXECUTION_MODE: "initialize" },
  },
  release: {
    executable: "node",
    arguments: ["apps/api/dist/scripts/publish-initial-chapter-release.js", chapterCode],
  },
  "story-map": {
    executable: "node",
    arguments: ["apps/api/dist/scripts/seed-chapter-01-story-map.js"],
  },
};

if (step === "help" || !step) {
  console.info("Usage: production-init.mjs <migrate|seed|release|story-map> [chapterCode]");
  console.info("Each invocation executes exactly one auditable initialization step.");
  process.exit(0);
}

if (!(step in commands)) {
  throw new Error(`未知初始化步骤：${step}。`);
}
if (!process.env.DATABASE_URL?.trim()) {
  throw new Error("初始化Job缺少 DATABASE_URL。");
}
if (step === "seed") {
  if (process.env.BASE_SEED_CONFIRMATION !== "INITIALIZE_EMPTY_DATABASE") {
    throw new Error(
      "Seed步骤要求 BASE_SEED_CONFIRMATION=INITIALIZE_EMPTY_DATABASE。",
    );
  }
  if (!process.env.SEED_ACTIVE_PAYMENT_OFFER_CODES?.trim()) {
    throw new Error(
      "Seed步骤要求显式提供 SEED_ACTIVE_PAYMENT_OFFER_CODES，不能替用户决定正式规则。",
    );
  }
}

const command = commands[step];
const startedAt = new Date().toISOString();
console.info(JSON.stringify({ event: "initialization_step_started", step, chapterCode, startedAt }));

const result = spawnSync(command.executable, command.arguments, {
  cwd: process.cwd(),
  env: { ...process.env, ...command.environment },
  stdio: "inherit",
  shell: false,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(
    JSON.stringify({
      event: "initialization_step_failed",
      step,
      exitCode: result.status,
      finishedAt: new Date().toISOString(),
    }),
  );
  process.exit(result.status ?? 1);
}

console.info(
  JSON.stringify({
    event: "initialization_step_completed",
    step,
    chapterCode,
    startedAt,
    finishedAt: new Date().toISOString(),
  }),
);
