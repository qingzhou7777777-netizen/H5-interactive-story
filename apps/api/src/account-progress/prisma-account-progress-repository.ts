import {
  ChapterReleaseStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import {
  ProgressStoreConflictError,
  type AccountProgressRepository,
  type CommitChoiceTransitionInput,
  type CommitVideoTransitionInput,
  type CreateChapterProgressInput,
  type StoredChapterProgress,
  type StoredChapterRelease,
} from "./account-progress-repository.js";

type TransactionClient = Prisma.TransactionClient;

const progressInclude = {
  chapterRelease: true,
} satisfies Prisma.UserChapterProgressInclude;

type ProgressWithRelease = Prisma.UserChapterProgressGetPayload<{
  include: typeof progressInclude;
}>;

function mapRelease(release: ProgressWithRelease["chapterRelease"]): StoredChapterRelease {
  return {
    id: release.id,
    version: release.version,
    snapshot: release.snapshot,
  };
}

function mapProgress(progress: ProgressWithRelease): StoredChapterProgress {
  return {
    id: progress.id,
    userId: progress.userId,
    chapterReleaseId: progress.chapterReleaseId,
    status: progress.status,
    currentNodeCode: progress.currentNodeCode,
    canonicalSnapshot: progress.canonicalSnapshot,
    progressVersion: progress.progressVersion,
    release: mapRelease(progress.chapterRelease),
  };
}

async function requireProgress(
  prisma: TransactionClient,
  progressId: string,
) {
  const progress = await prisma.userChapterProgress.findUnique({
    where: { id: progressId },
    include: progressInclude,
  });
  if (!progress) {
    throw new ProgressStoreConflictError("VERSION");
  }
  return mapProgress(progress);
}

function progressUpdateData(
  input: CommitVideoTransitionInput | CommitChoiceTransitionInput,
  now: Date,
): Prisma.UserChapterProgressUpdateManyMutationInput {
  return {
    status: input.status,
    currentNodeCode: input.currentNodeCode,
    canonicalSnapshot: input.canonicalSnapshot as unknown as Prisma.InputJsonValue,
    progressVersion: { increment: 1 },
    lastPlayedAt: now,
    ...(input.status === "COMPLETED" ? { completedAt: now } : {}),
  };
}

function completedNodeData(now: Date, requestKey?: string) {
  return {
    firstStartedAt: now,
    firstCompletedAt: now,
    lastCompletedAt: now,
    completionCount: 1,
    lastPlayedAt: now,
    ...(requestKey ? { completionRequestKey: requestKey } : {}),
  };
}

async function upsertTargetNode(
  prisma: TransactionClient,
  input: CommitVideoTransitionInput | CommitChoiceTransitionInput,
  now: Date,
) {
  if (input.targetNodeCode === input.sourceNodeCode) {
    return;
  }
  const completed = input.targetNodeCompleted ? completedNodeData(now) : {};
  await prisma.userNodeProgress.upsert({
    where: {
      chapterProgressId_nodeCode: {
        chapterProgressId: input.progress.id,
        nodeCode: input.targetNodeCode,
      },
    },
    create: {
      chapterProgressId: input.progress.id,
      nodeCode: input.targetNodeCode,
      availableAt: now,
      firstStartedAt: now,
      lastPlayedAt: now,
      ...completed,
    },
    update: {
      availableAt: now,
      lastPlayedAt: now,
      ...completed,
    },
  });
}

export class PrismaAccountProgressRepository implements AccountProgressRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserAndChapter(userId: string, chapterCode: string) {
    const progress = await this.prisma.userChapterProgress.findFirst({
      where: {
        userId,
        chapterRelease: { chapter: { code: chapterCode } },
      },
      include: progressInclude,
      orderBy: { createdAt: "desc" },
    });
    return progress ? mapProgress(progress) : null;
  }

  async findActiveRelease(chapterCode: string) {
    const release = await this.prisma.chapterRelease.findFirst({
      where: {
        status: ChapterReleaseStatus.ACTIVE,
        chapter: { code: chapterCode },
      },
      orderBy: { version: "desc" },
    });
    return release
      ? { id: release.id, version: release.version, snapshot: release.snapshot }
      : null;
  }

  async createProgress(input: CreateChapterProgressInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        const progress = await transaction.userChapterProgress.create({
          data: {
            userId: input.userId,
            chapterReleaseId: input.release.id,
            status: input.status,
            currentNodeCode: input.currentNodeCode,
            canonicalSnapshot:
              input.canonicalSnapshot as unknown as Prisma.InputJsonValue,
            completedAt: input.status === "COMPLETED" ? now : null,
          },
          include: progressInclude,
        });
        await transaction.userNodeProgress.create({
          data: {
            chapterProgressId: progress.id,
            nodeCode: input.currentNodeCode,
            availableAt: now,
            firstStartedAt: now,
            lastPlayedAt: now,
            ...(input.initialNodeCompleted ? completedNodeData(now) : {}),
          },
        });
        return mapProgress(progress);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.findByUserAndChapter(
          input.userId,
          readChapterCode(input.release.snapshot),
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  async findByVideoRequest(progressId: string, requestKey: string) {
    const node = await this.prisma.userNodeProgress.findUnique({
      where: { completionRequestKey: requestKey },
    });
    return node?.chapterProgressId === progressId
      ? this.findProgressById(progressId)
      : null;
  }

  async findByChoiceRequest(progressId: string, requestKey: string) {
    const decision = await this.prisma.userChoiceDecision.findUnique({
      where: { requestKey },
    });
    return decision?.chapterProgressId === progressId
      ? this.findProgressById(progressId)
      : null;
  }

  async commitVideoTransition(input: CommitVideoTransitionInput) {
    return this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.userNodeProgress.findUnique({
        where: { completionRequestKey: input.requestKey },
      });
      if (duplicate) {
        if (duplicate.chapterProgressId !== input.progress.id) {
          throw new ProgressStoreConflictError("REQUEST");
        }
        return requireProgress(transaction, input.progress.id);
      }

      const now = new Date();
      const updated = await transaction.userChapterProgress.updateMany({
        where: {
          id: input.progress.id,
          userId: input.progress.userId,
          chapterReleaseId: input.progress.chapterReleaseId,
          progressVersion: input.expectedVersion,
        },
        data: progressUpdateData(input, now),
      });
      if (updated.count !== 1) {
        throw new ProgressStoreConflictError("VERSION");
      }

      await transaction.userNodeProgress.upsert({
        where: {
          chapterProgressId_nodeCode: {
            chapterProgressId: input.progress.id,
            nodeCode: input.sourceNodeCode,
          },
        },
        create: {
          chapterProgressId: input.progress.id,
          nodeCode: input.sourceNodeCode,
          ...completedNodeData(now, input.requestKey),
        },
        update: completedNodeData(now, input.requestKey),
      });
      await upsertTargetNode(transaction, input, now);
      return requireProgress(transaction, input.progress.id);
    });
  }

  async commitChoiceTransition(input: CommitChoiceTransitionInput) {
    return this.prisma.$transaction(async (transaction) => {
      const duplicate = await transaction.userChoiceDecision.findUnique({
        where: { requestKey: input.requestKey },
      });
      if (duplicate) {
        if (duplicate.chapterProgressId !== input.progress.id) {
          throw new ProgressStoreConflictError("REQUEST");
        }
        return requireProgress(transaction, input.progress.id);
      }

      const now = new Date();
      const updated = await transaction.userChapterProgress.updateMany({
        where: {
          id: input.progress.id,
          userId: input.progress.userId,
          chapterReleaseId: input.progress.chapterReleaseId,
          progressVersion: input.expectedVersion,
        },
        data: progressUpdateData(input, now),
      });
      if (updated.count !== 1) {
        throw new ProgressStoreConflictError("VERSION");
      }

      await transaction.userChoiceDecision.create({
        data: {
          chapterProgressId: input.progress.id,
          sourceNodeCode: input.sourceNodeCode,
          choiceCode: input.choiceCode,
          targetNodeCode: input.targetNodeCode,
          requestKey: input.requestKey,
        },
      });
      if (input.markSourceCompleted) {
        await transaction.userNodeProgress.upsert({
          where: {
            chapterProgressId_nodeCode: {
              chapterProgressId: input.progress.id,
              nodeCode: input.sourceNodeCode,
            },
          },
          create: {
            chapterProgressId: input.progress.id,
            nodeCode: input.sourceNodeCode,
            ...completedNodeData(now),
          },
          update: completedNodeData(now),
        });
      }
      await upsertTargetNode(transaction, input, now);
      return requireProgress(transaction, input.progress.id);
    });
  }

  private async findProgressById(progressId: string) {
    const progress = await this.prisma.userChapterProgress.findUnique({
      where: { id: progressId },
      include: progressInclude,
    });
    return progress ? mapProgress(progress) : null;
  }
}

function readChapterCode(snapshot: unknown) {
  if (
    snapshot &&
    typeof snapshot === "object" &&
    "chapter" in snapshot &&
    snapshot.chapter &&
    typeof snapshot.chapter === "object" &&
    "code" in snapshot.chapter &&
    typeof snapshot.chapter.code === "string"
  ) {
    return snapshot.chapter.code;
  }
  throw new Error("ChapterRelease snapshot 缺少 chapter.code。");
}
