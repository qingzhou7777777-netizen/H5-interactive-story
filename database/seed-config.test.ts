import { describe, expect, it } from "vitest";

import {
  PAYMENT_OFFER_CODES,
  assertInitializationTargetEmpty,
  isMigrationPlaceholderStory,
  readBaseSeedConfig,
} from "./seed-config";

describe("base seed safety", () => {
  it("keeps the existing three-active development behavior without claiming one active", () => {
    const config = readBaseSeedConfig({ NODE_ENV: "development" });
    expect(config.mode).toBe("development");
    expect([...config.activePaymentOfferCodes]).toEqual(PAYMENT_OFFER_CODES);
  });

  it("requires an explicit production initialization mode", () => {
    expect(() => readBaseSeedConfig({ NODE_ENV: "production" })).toThrow(
      "禁止直接运行基础Seed",
    );
  });

  it("does not decide the production offer rule implicitly", () => {
    expect(() =>
      readBaseSeedConfig({
        NODE_ENV: "production",
        SEED_EXECUTION_MODE: "initialize",
        BASE_SEED_CONFIRMATION: "INITIALIZE_EMPTY_DATABASE",
      }),
    ).toThrow("必须显式配置 SEED_ACTIVE_PAYMENT_OFFER_CODES");
  });

  it("accepts only explicitly selected known offers for initialization", () => {
    const config = readBaseSeedConfig({
      NODE_ENV: "production",
      SEED_EXECUTION_MODE: "initialize",
      BASE_SEED_CONFIRMATION: "INITIALIZE_EMPTY_DATABASE",
      SEED_ACTIVE_PAYMENT_OFFER_CODES: "chapter01-ending002-unlock",
    });
    expect([...config.activePaymentOfferCodes]).toEqual(["chapter01-ending002-unlock"]);
  });

  it("refuses a repeated or partially completed initialization", () => {
    expect(() => assertInitializationTargetEmpty(["Story:ai-romance-demo"])).toThrow(
      "未初始化环境",
    );
  });

  it("recognizes only the exact Story row backfilled by migration 202609200003", () => {
    expect(isMigrationPlaceholderStory({
      id: "00000000-0000-4000-8000-000000000001",
      code: "ai-romance-demo",
      title: "AI 恋爱互动剧情",
      description: "由迁移创建的默认故事。",
      status: "DRAFT",
    })).toBe(true);
    expect(isMigrationPlaceholderStory({
      id: "00000000-0000-4000-8000-000000000001",
      code: "ai-romance-demo",
      title: "AI 恋爱互动剧情",
      description: "已由运营修改",
      status: "ACTIVE",
    })).toBe(false);
  });
});
