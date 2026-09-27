import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient } from "@prisma/client";
import Fastify from "fastify";

import type { HealthResponse } from "@interactive-story/api-contracts";

import { PrismaAdminContentRepository } from "./admin/prisma-admin-content-repository.js";
import { PrismaVideoAssetProductionRepository } from "./admin/prisma-video-asset-production-repository.js";
import { registerAdminRoutes } from "./admin/admin-routes.js";
import { registerAdminUploadRoutes } from "./admin/admin-upload-routes.js";
import type { AdminContentRepository } from "./admin/admin-content-repository.js";
import type { AnalyticsRepository } from "./analytics/analytics-repository.js";
import { registerAdminAnalyticsRoutes, registerAnalyticsRoutes } from "./analytics/analytics-routes.js";
import { PrismaAnalyticsRepository } from "./analytics/prisma-analytics-repository.js";
import { registerAccountProgressRoutes } from "./account-progress/account-progress-routes.js";
import {
  AccountProgressService,
  type AccountProgressUseCase,
} from "./account-progress/account-progress-service.js";
import { PrismaAccountProgressRepository } from "./account-progress/prisma-account-progress-repository.js";
import { registerAuthRoutes } from "./auth/auth-routes.js";
import {
  AccountAuthenticationService,
  type AccountAuthenticator,
} from "./auth/authentication.js";
import { OidcJwtVerifier } from "./auth/oidc-jwt-verifier.js";
import { PrismaUserRepository } from "./auth/prisma-user-repository.js";
import type { PaymentOfferRepository } from "./commercial-test/payment-offer-repository.js";
import { registerPaymentOfferRoutes } from "./commercial-test/payment-offer-routes.js";
import { PrismaPaymentOfferRepository } from "./commercial-test/prisma-payment-offer-repository.js";
import { getVideoUploadMaxBytes, createS3ObjectStorageFromEnv } from "./media/s3-object-storage.js";
import { VideoAssetUploadService, type VideoAssetUploadUseCase } from "./media/video-asset-upload-service.js";
import { FfprobeVideoInspector } from "./media/video-inspector.js";
import { PrismaStoryContentRepository } from "./story/prisma-story-content-repository.js";
import { registerStoryRoutes } from "./story/story-routes.js";
import type { StoryContentRepository } from "./story/story-content-repository.js";
import { PrismaStoryMapRepository } from "./story-map/prisma-story-map-repository.js";
import { registerStoryMapRoutes } from "./story-map/story-map-routes.js";
import {
  StoryMapService,
  type StoryMapUseCase,
} from "./story-map/story-map-service.js";
import { PrismaStoryRunRepository } from "./story-run/prisma-story-run-repository.js";
import { registerStoryRunRoutes } from "./story-run/story-run-routes.js";
import {
  StoryRunService,
  type StoryRunUseCase,
} from "./story-run/story-run-service.js";
import { readApiRuntimeConfig, type ApiRuntimeConfig } from "./runtime-config.js";

interface BuildAppOptions {
  storyRepository?: StoryContentRepository;
  adminRepository?: AdminContentRepository;
  videoAssetUploadService?: VideoAssetUploadUseCase;
  analyticsRepository?: AnalyticsRepository;
  paymentOfferRepository?: PaymentOfferRepository;
  accountAuthenticator?: AccountAuthenticator;
  accountProgressService?: AccountProgressUseCase;
  storyMapService?: StoryMapUseCase;
  storyRunService?: StoryRunUseCase;
  runtimeConfig?: ApiRuntimeConfig;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const runtimeConfig = options.runtimeConfig ?? readApiRuntimeConfig();
  const app = Fastify({
    logger: runtimeConfig.isTest
      ? false
      : {
          level: runtimeConfig.logLevel,
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "res.headers.set-cookie",
            ],
            censor: "[REDACTED]",
          },
        },
    trustProxy: runtimeConfig.trustProxy,
    bodyLimit: runtimeConfig.bodyLimitBytes,
    requestTimeout: runtimeConfig.requestTimeoutMs,
    requestIdHeader: "x-request-id",
  });

  await app.register(cors, {
    origin:
      runtimeConfig.corsOrigins.length > 0
        ? runtimeConfig.corsOrigins
        : runtimeConfig.isProduction
          ? false
          : true,
  });
  await app.register(multipart);
  await app.register(rateLimit, {
    global: false,
    max: runtimeConfig.analyticsRateLimitMax,
    timeWindow: runtimeConfig.analyticsRateLimitWindowMs,
  });

  const needsPrisma = !(
    options.storyRepository &&
    options.adminRepository &&
    options.videoAssetUploadService &&
    options.analyticsRepository &&
    options.paymentOfferRepository
  ) ||
    (runtimeConfig.accountAuth.enabled &&
      (!options.accountAuthenticator ||
        !options.accountProgressService ||
        !options.storyMapService ||
        !options.storyRunService));
  const prisma = needsPrisma ? new PrismaClient() : null;
  const storyRepository =
    options.storyRepository ?? new PrismaStoryContentRepository(prisma!);
  const adminRepository =
    options.adminRepository ?? new PrismaAdminContentRepository(prisma!);
  const videoAssetUploadService =
    options.videoAssetUploadService ??
    new VideoAssetUploadService(
      adminRepository,
      new PrismaVideoAssetProductionRepository(prisma!),
      createS3ObjectStorageFromEnv(),
      new FfprobeVideoInspector(),
      getVideoUploadMaxBytes(),
    );
  const analyticsRepository =
    options.analyticsRepository ?? new PrismaAnalyticsRepository(prisma!);
  const paymentOfferRepository =
    options.paymentOfferRepository ?? new PrismaPaymentOfferRepository(prisma!);

  let accountAuthenticator = options.accountAuthenticator;
  if (runtimeConfig.accountAuth.enabled && !accountAuthenticator) {
    const { issuer, audience, jwksUrl, algorithms } = runtimeConfig.accountAuth;
    if (!issuer || !audience || !jwksUrl) {
      throw new Error("账号认证已启用，但 OIDC 配置不完整。");
    }
    accountAuthenticator = new AccountAuthenticationService(
      new OidcJwtVerifier({ issuer, audience, jwksUrl, algorithms }),
      new PrismaUserRepository(prisma!),
    );
  }
  const accountProgressService =
    options.accountProgressService ??
    (runtimeConfig.accountAuth.enabled
      ? new AccountProgressService(new PrismaAccountProgressRepository(prisma!))
      : null);
  const storyMapService =
    options.storyMapService ??
    (runtimeConfig.accountAuth.enabled
      ? new StoryMapService(new PrismaStoryMapRepository(prisma!))
      : null);
  const storyRunService =
    options.storyRunService ??
    (runtimeConfig.accountAuth.enabled && storyMapService
      ? new StoryRunService(
          new PrismaStoryRunRepository(prisma!),
          storyMapService,
        )
      : null);

  const health = (): HealthResponse => ({
    status: "ok",
    service: "interactive-story-api",
    timestamp: new Date().toISOString(),
  });

  app.get<{ Reply: HealthResponse }>("/health", async () => health());
  app.get<{ Reply: HealthResponse }>("/health/live", async () => health());
  app.get("/health/ready", async (_request, reply) => {
    try {
      if (prisma) {
        await prisma.$queryRaw`SELECT 1`;
      }
      return {
        ...health(),
        checks: { database: prisma ? "ok" : "injected" },
      };
    } catch (error) {
      app.log.error({ err: error }, "readiness check failed");
      return reply.code(503).send({
        status: "unavailable",
        service: "interactive-story-api",
        timestamp: new Date().toISOString(),
        checks: { database: "error" },
      });
    }
  });

  await registerStoryRoutes(app, storyRepository);
  await registerAdminRoutes(app, adminRepository);
  await registerAdminUploadRoutes(app, videoAssetUploadService);
  await registerAnalyticsRoutes(app, analyticsRepository, {
    rateLimit: {
      max: runtimeConfig.analyticsRateLimitMax,
      timeWindow: runtimeConfig.analyticsRateLimitWindowMs,
    },
  });
  await registerAdminAnalyticsRoutes(app, analyticsRepository);
  await registerPaymentOfferRoutes(app, paymentOfferRepository);
  if (runtimeConfig.accountAuth.enabled && accountAuthenticator) {
    await registerAuthRoutes(app, accountAuthenticator);
    if (accountProgressService) {
      await registerAccountProgressRoutes(
        app,
        accountAuthenticator,
        accountProgressService,
      );
    }
    if (storyMapService) {
      await registerStoryMapRoutes(app, accountAuthenticator, storyMapService);
    }
    if (storyRunService) {
      await registerStoryRunRoutes(app, accountAuthenticator, storyRunService);
    }
  }

  if (prisma) {
    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  }

  return app;
}
