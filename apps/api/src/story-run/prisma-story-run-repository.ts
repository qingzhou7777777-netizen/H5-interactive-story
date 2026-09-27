import { Prisma, type PrismaClient } from "@prisma/client";

import {
  StoryRunStoreConflictError,
  type CommitRunChoiceInput,
  type CommitRunVideoInput,
  type CreateStoryRunInput,
  type StoredStoryRun,
  type StoryRunRepository,
} from "./story-run-repository.js";

type TransactionClient = Prisma.TransactionClient;

const runSelect = {
  id: true,
  chapterProgressId: true,
  mode: true,
  status: true,
  entryNodeCode: true,
  currentNodeCode: true,
  canonicalSnapshot: true,
  runVersion: true,
  startRequestKey: true,
  chapterProgress: {
    select: {
      userId: true,
      chapterRelease: {
        select: {
          id: true,
          version: true,
          snapshot: true,
          chapter: { select: { code: true } },
        },
      },
    },
  },
} satisfies Prisma.UserExplorationRunSelect;

type RunRecord = Prisma.UserExplorationRunGetPayload<{
  select: typeof runSelect;
}>;

function mapRun(run: RunRecord): StoredStoryRun {
  return {
    id: run.id,
    progressId: run.chapterProgressId,
    userId: run.chapterProgress.userId,
    chapterCode: run.chapterProgress.chapterRelease.chapter.code,
    release: {
      id: run.chapterProgress.chapterRelease.id,
      version: run.chapterProgress.chapterRelease.version,
      snapshot: run.chapterProgress.chapterRelease.snapshot,
    },
    mode: run.mode,
    status: run.status,
    entryNodeCode: run.entryNodeCode,
    currentNodeCode: run.currentNodeCode,
    canonicalSnapshot: run.canonicalSnapshot,
    runVersion: run.runVersion,
    startRequestKey: run.startRequestKey,
  };
}

async function requireRun(prisma: TransactionClient, runId: string) {
  const run = await prisma.userExplorationRun.findUnique({
    where: { id: runId },
    select: runSelect,
  });
  if (!run) throw new StoryRunStoreConflictError("STATE");
  return mapRun(run);
}

async function requireCurrentSession(
  prisma: TransactionClient,
  runId: string,
  sourceNodeCode: string,
) {
  const session = await prisma.userNodePlaySession.findFirst({
    where: { explorationRunId: runId },
    orderBy: { sequence: "desc" },
  });
  if (!session || session.nodeCode !== sourceNodeCode) {
    throw new StoryRunStoreConflictError("STATE");
  }
  return session;
}

function runUpdateData(
  input: CommitRunVideoInput | CommitRunChoiceInput,
  now: Date,
): Prisma.UserExplorationRunUpdateManyMutationInput {
  return {
    status: input.status,
    currentNodeCode: input.currentNodeCode,
    canonicalSnapshot: input.canonicalSnapshot as unknown as Prisma.InputJsonValue,
    runVersion: { increment: 1 },
    lastPlayedAt: now,
    ...(input.status === "COMPLETED" ? { completedAt: now } : {}),
  };
}

async function updateRun(
  prisma: TransactionClient,
  input: CommitRunVideoInput | CommitRunChoiceInput,
  now: Date,
) {
  const updated = await prisma.userExplorationRun.updateMany({
    where: {
      id: input.run.id,
      chapterProgressId: input.run.progressId,
      status: "ACTIVE",
      runVersion: input.expectedVersion,
    },
    data: runUpdateData(input, now),
  });
  if (updated.count !== 1) {
    const current = await prisma.userExplorationRun.findUnique({
      where: { id: input.run.id },
      select: { status: true, runVersion: true },
    });
    throw new StoryRunStoreConflictError(
      current?.status === "ACTIVE" && current.runVersion !== input.expectedVersion
        ? "VERSION"
        : "STATE",
    );
  }
}

async function createTargetSession(
  prisma: TransactionClient,
  input: CommitRunVideoInput | CommitRunChoiceInput,
  sequence: number,
  now: Date,
) {
  if (!input.enteredTargetNode) return;
  await prisma.userNodePlaySession.create({
    data: {
      explorationRunId: input.run.id,
      nodeCode: input.targetNodeCode,
      sequence,
      enteredAt: now,
      completedAt: input.targetNodeCompleted ? now : null,
    },
  });
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export class PrismaStoryRunRepository implements StoryRunRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findChapterContext(userId: string, chapterCode: string) {
    const progress = await this.prisma.userChapterProgress.findFirst({
      where: {
        userId,
        chapterRelease: { chapter: { code: chapterCode } },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        chapterRelease: {
          select: {
            id: true,
            version: true,
            snapshot: true,
            chapter: { select: { code: true } },
          },
        },
      },
    });
    return progress
      ? {
          progressId: progress.id,
          userId: progress.userId,
          chapterCode: progress.chapterRelease.chapter.code,
          release: {
            id: progress.chapterRelease.id,
            version: progress.chapterRelease.version,
            snapshot: progress.chapterRelease.snapshot,
          },
        }
      : null;
  }

  async findByStartRequest(requestKey: string) {
    const run = await this.prisma.userExplorationRun.findUnique({
      where: { startRequestKey: requestKey },
      select: runSelect,
    });
    return run ? mapRun(run) : null;
  }

  async findRun(userId: string, chapterCode: string, runId: string) {
    const run = await this.prisma.userExplorationRun.findFirst({
      where: {
        id: runId,
        chapterProgress: {
          userId,
          chapterRelease: { chapter: { code: chapterCode } },
        },
      },
      select: runSelect,
    });
    return run ? mapRun(run) : null;
  }

  async findByVideoRequest(runId: string, requestKey: string) {
    const session = await this.prisma.userNodePlaySession.findUnique({
      where: { completionRequestKey: requestKey },
      select: { explorationRunId: true },
    });
    if (!session) return null;
    if (session.explorationRunId !== runId) {
      throw new StoryRunStoreConflictError("REQUEST");
    }
    const run = await this.prisma.userExplorationRun.findUnique({
      where: { id: runId },
      select: runSelect,
    });
    return run ? mapRun(run) : null;
  }

  async findByChoiceRequest(runId: string, requestKey: string) {
    const decision = await this.prisma.userExplorationChoiceDecision.findUnique({
      where: { requestKey },
      select: { explorationRunId: true },
    });
    if (!decision) return null;
    if (decision.explorationRunId !== runId) {
      throw new StoryRunStoreConflictError("REQUEST");
    }
    const run = await this.prisma.userExplorationRun.findUnique({
      where: { id: runId },
      select: runSelect,
    });
    return run ? mapRun(run) : null;
  }

  async createRun(input: CreateStoryRunInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const now = new Date();
        const run = await transaction.userExplorationRun.create({
          data: {
            chapterProgressId: input.progressId,
            mode: input.mode,
            status: input.status,
            entryNodeCode: input.entryNodeCode,
            currentNodeCode: input.currentNodeCode,
            canonicalSnapshot:
              input.canonicalSnapshot as unknown as Prisma.InputJsonValue,
            startRequestKey: input.startRequestKey,
            startedAt: now,
            lastPlayedAt: now,
            completedAt: input.status === "COMPLETED" ? now : null,
          },
        });
        await transaction.userNodePlaySession.create({
          data: {
            explorationRunId: run.id,
            nodeCode: input.currentNodeCode,
            sequence: 1,
            enteredAt: now,
            completedAt: input.initialNodeCompleted ? now : null,
          },
        });
        return requireRun(transaction, run.id);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        const duplicate = await this.findByStartRequest(input.startRequestKey);
        if (
          duplicate &&
          duplicate.userId === input.userId &&
          duplicate.chapterCode === input.chapterCode &&
          duplicate.release.id === input.release.id &&
          duplicate.mode === input.mode &&
          duplicate.entryNodeCode === input.entryNodeCode
        ) {
          return duplicate;
        }
        throw new StoryRunStoreConflictError(
          duplicate ? "REQUEST" : "ACTIVE_RUN",
        );
      }
      throw error;
    }
  }

  async commitVideoTransition(input: CommitRunVideoInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const duplicate = await transaction.userNodePlaySession.findUnique({
          where: { completionRequestKey: input.requestKey },
        });
        if (duplicate) {
          if (duplicate.explorationRunId !== input.run.id) {
            throw new StoryRunStoreConflictError("REQUEST");
          }
          return requireRun(transaction, input.run.id);
        }

        const now = new Date();
        const sourceSession = await requireCurrentSession(
          transaction,
          input.run.id,
          input.sourceNodeCode,
        );
        await updateRun(transaction, input, now);
        await transaction.userNodePlaySession.update({
          where: { id: sourceSession.id },
          data: { completedAt: now, completionRequestKey: input.requestKey },
        });
        await createTargetSession(
          transaction,
          input,
          sourceSession.sequence + 1,
          now,
        );
        return requireRun(transaction, input.run.id);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new StoryRunStoreConflictError("REQUEST");
      }
      throw error;
    }
  }

  async commitChoiceTransition(input: CommitRunChoiceInput) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const duplicate =
          await transaction.userExplorationChoiceDecision.findUnique({
            where: { requestKey: input.requestKey },
          });
        if (duplicate) {
          if (duplicate.explorationRunId !== input.run.id) {
            throw new StoryRunStoreConflictError("REQUEST");
          }
          return requireRun(transaction, input.run.id);
        }

        const now = new Date();
        const sourceSession = await requireCurrentSession(
          transaction,
          input.run.id,
          input.sourceNodeCode,
        );
        await updateRun(transaction, input, now);
        if (!sourceSession.completedAt) {
          await transaction.userNodePlaySession.update({
            where: { id: sourceSession.id },
            data: { completedAt: now },
          });
        }
        await transaction.userExplorationChoiceDecision.create({
          data: {
            explorationRunId: input.run.id,
            sourcePlaySessionId: sourceSession.id,
            sequence: sourceSession.sequence,
            sourceNodeCode: input.sourceNodeCode,
            choiceCode: input.choiceCode,
            targetNodeCode: input.targetNodeCode,
            requestKey: input.requestKey,
            selectedAt: now,
          },
        });
        await createTargetSession(
          transaction,
          input,
          sourceSession.sequence + 1,
          now,
        );
        return requireRun(transaction, input.run.id);
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new StoryRunStoreConflictError("REQUEST");
      }
      throw error;
    }
  }

  async abandonRun(run: StoredStoryRun, expectedVersion: number) {
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const updated = await transaction.userExplorationRun.updateMany({
        where: {
          id: run.id,
          chapterProgressId: run.progressId,
          status: "ACTIVE",
          runVersion: expectedVersion,
        },
        data: {
          status: "ABANDONED",
          runVersion: { increment: 1 },
          abandonedAt: now,
          lastPlayedAt: now,
        },
      });
      if (updated.count !== 1) {
        const current = await transaction.userExplorationRun.findUnique({
          where: { id: run.id },
          select: { status: true, runVersion: true },
        });
        throw new StoryRunStoreConflictError(
          current?.status === "ACTIVE" && current.runVersion !== expectedVersion
            ? "VERSION"
            : "STATE",
        );
      }
      return requireRun(transaction, run.id);
    });
  }
}
