export const PAYMENT_OFFER_CODES = [
  "chapter01-ending002-unlock",
  "chapter01-ending003-unlock",
  "chapter01-ending004-unlock",
] as const;

export type SeedExecutionMode = "development" | "initialize";

export interface BaseSeedConfig {
  mode: SeedExecutionMode;
  activePaymentOfferCodes: ReadonlySet<string>;
}

export interface MigrationPlaceholderStory {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: string;
}

const INITIALIZATION_CONFIRMATION = "INITIALIZE_EMPTY_DATABASE";

export function readBaseSeedConfig(
  env: NodeJS.ProcessEnv = process.env,
): BaseSeedConfig {
  const requestedMode = env.SEED_EXECUTION_MODE?.trim();
  if (requestedMode && requestedMode !== "development" && requestedMode !== "initialize") {
    throw new Error("SEED_EXECUTION_MODE 只能是 development 或 initialize。");
  }

  if (env.NODE_ENV === "production" && !requestedMode) {
    throw new Error(
      "生产模式禁止直接运行基础Seed；必须通过受控初始化Job设置 SEED_EXECUTION_MODE=initialize。",
    );
  }

  const mode: SeedExecutionMode = requestedMode === "initialize" ? "initialize" : "development";
  if (env.NODE_ENV === "production" && mode !== "initialize") {
    throw new Error("生产模式只能使用 initialize Seed模式。");
  }

  if (mode === "initialize" && env.BASE_SEED_CONFIRMATION !== INITIALIZATION_CONFIRMATION) {
    throw new Error(
      `初始化Seed必须显式设置 BASE_SEED_CONFIRMATION=${INITIALIZATION_CONFIRMATION}。`,
    );
  }

  const configuredOfferCodes = env.SEED_ACTIVE_PAYMENT_OFFER_CODES
    ?.split(",")
    .map((code) => code.trim())
    .filter(Boolean);

  if (mode === "initialize" && !configuredOfferCodes?.length) {
    throw new Error(
      "初始化Seed必须显式配置 SEED_ACTIVE_PAYMENT_OFFER_CODES；正式规则仍需用户确认。",
    );
  }

  const activePaymentOfferCodes = new Set(
    configuredOfferCodes?.length ? configuredOfferCodes : PAYMENT_OFFER_CODES,
  );
  const invalidCodes = [...activePaymentOfferCodes].filter(
    (code) => !PAYMENT_OFFER_CODES.includes(code as (typeof PAYMENT_OFFER_CODES)[number]),
  );
  if (invalidCodes.length > 0) {
    throw new Error(`SEED_ACTIVE_PAYMENT_OFFER_CODES 包含未知Offer：${invalidCodes.join(", ")}`);
  }

  return { mode, activePaymentOfferCodes };
}

export function assertInitializationTargetEmpty(existingTargets: readonly string[]) {
  if (existingTargets.length > 0) {
    throw new Error(
      `基础Seed只允许在未初始化环境执行；检测到既有目标：${existingTargets.join(", ")}。` +
        "已停止，未覆盖任何内容或正式媒体。",
    );
  }
}

export function isMigrationPlaceholderStory(
  story: MigrationPlaceholderStory | null,
) {
  return story !== null &&
    story.id === "00000000-0000-4000-8000-000000000001" &&
    story.code === "ai-romance-demo" &&
    story.title === "AI 恋爱互动剧情" &&
    story.description === "由迁移创建的默认故事。" &&
    story.status === "DRAFT";
}
