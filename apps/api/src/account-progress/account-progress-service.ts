import type {
  AccountChapterProgressResponse,
  CompleteAccountVideoRequest,
  SelectAccountChoiceRequest,
  StoryEngineSnapshotDto,
  ChapterDto,
} from "@interactive-story/api-contracts";
import {
  StoryEngine,
  StoryEngineError,
  type RuntimeStoryDefinition,
  type StoryRuntimeSnapshot,
} from "@interactive-story/story-core";

import {
  ProgressStoreConflictError,
  type AccountProgressRepository,
  type StoredChapterProgress,
  type StoredChapterRelease,
} from "./account-progress-repository.js";

interface ChapterReleaseSnapshot {
  schemaVersion: 1;
  chapter: ChapterDto;
  runtimeStory: RuntimeStoryDefinition;
}

export type AccountProgressErrorCode =
  | "CHAPTER_PROGRESS_NOT_FOUND"
  | "CHAPTER_RELEASE_UNAVAILABLE"
  | "PROGRESS_VERSION_CONFLICT"
  | "PROGRESS_STATE_CONFLICT"
  | "PROGRESS_REQUEST_CONFLICT"
  | "PROGRESS_DATA_INVALID";

const errorMessages: Record<AccountProgressErrorCode, string> = {
  CHAPTER_PROGRESS_NOT_FOUND: "当前账号尚未开始该章节。",
  CHAPTER_RELEASE_UNAVAILABLE: "章节暂时无法开始，请稍后重试。",
  PROGRESS_VERSION_CONFLICT: "剧情进度已在其他设备更新，请刷新后重试。",
  PROGRESS_STATE_CONFLICT: "当前剧情状态不能执行该操作。",
  PROGRESS_REQUEST_CONFLICT: "请求幂等键已被其他剧情操作使用。",
  PROGRESS_DATA_INVALID: "服务端剧情进度数据无效。",
};

export class AccountProgressError extends Error {
  constructor(
    public readonly code: AccountProgressErrorCode,
    public readonly statusCode: 404 | 409 | 503,
  ) {
    super(errorMessages[code]);
    this.name = "AccountProgressError";
  }
}

export interface AccountProgressUseCase {
  getProgress(userId: string, chapterCode: string): Promise<AccountChapterProgressResponse>;
  startChapter(userId: string, chapterCode: string): Promise<AccountChapterProgressResponse>;
  completeVideo(
    userId: string,
    chapterCode: string,
    request: CompleteAccountVideoRequest,
  ): Promise<AccountChapterProgressResponse>;
  selectChoice(
    userId: string,
    chapterCode: string,
    request: SelectAccountChoiceRequest,
  ): Promise<AccountChapterProgressResponse>;
}

export class AccountProgressService implements AccountProgressUseCase {
  constructor(private readonly repository: AccountProgressRepository) {}

  async getProgress(userId: string, chapterCode: string) {
    const progress = await this.requireProgress(userId, chapterCode);
    this.restoreEngine(progress);
    return this.toResponse(progress);
  }

  async startChapter(userId: string, chapterCode: string) {
    const existing = await this.repository.findByUserAndChapter(userId, chapterCode);
    if (existing) {
      this.restoreEngine(existing);
      return this.toResponse(existing);
    }

    const release = await this.repository.findActiveRelease(chapterCode);
    if (!release) {
      throw new AccountProgressError("CHAPTER_RELEASE_UNAVAILABLE", 503);
    }
    const releaseSnapshot = readReleaseSnapshot(release.snapshot);
    const engine = new StoryEngine(releaseSnapshot.runtimeStory);
    let state;
    try {
      state = engine.start();
    } catch {
      throw new AccountProgressError("PROGRESS_DATA_INVALID", 503);
    }
    const snapshot = requireSnapshot(engine);
    const progress = await this.repository.createProgress({
      userId,
      release,
      status: state.phase === "ended" ? "COMPLETED" : "IN_PROGRESS",
      currentNodeCode: snapshot.currentNodeId,
      canonicalSnapshot: snapshot,
      initialNodeCompleted: state.phase === "ended",
    });
    return this.toResponse(progress);
  }

  async completeVideo(
    userId: string,
    chapterCode: string,
    request: CompleteAccountVideoRequest,
  ) {
    const progress = await this.requireProgress(userId, chapterCode);
    this.requireRelease(progress, request.releaseId);
    const duplicate = await this.repository.findByVideoRequest(
      progress.id,
      request.requestKey,
    );
    if (duplicate) return this.toResponse(duplicate);
    this.requireVersion(progress, request.expectedProgressVersion);
    if (progress.status === "COMPLETED") {
      throw new AccountProgressError("PROGRESS_STATE_CONFLICT", 409);
    }

    const engine = this.restoreEngine(progress);
    const before = engine.getState();
    if (
      before.phase !== "playing" ||
      before.currentNode?.type !== "video" ||
      before.currentNodeId !== request.nodeCode
    ) {
      throw new AccountProgressError("PROGRESS_STATE_CONFLICT", 409);
    }

    let after;
    try {
      after = engine.completeVideo();
    } catch (error) {
      throw mapEngineError(error);
    }
    const snapshot = requireSnapshot(engine);
    const targetNode = after.currentNode;
    const status = after.phase === "ended" ? "COMPLETED" : "IN_PROGRESS";

    try {
      const updated = await this.repository.commitVideoTransition({
        progress,
        expectedVersion: request.expectedProgressVersion,
        requestKey: request.requestKey,
        sourceNodeCode: request.nodeCode,
        status,
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        targetNodeCode: snapshot.currentNodeId,
        targetNodeCompleted:
          after.phase === "ended" && targetNode?.type === "ending",
      });
      return this.toResponse(updated);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async selectChoice(
    userId: string,
    chapterCode: string,
    request: SelectAccountChoiceRequest,
  ) {
    const progress = await this.requireProgress(userId, chapterCode);
    this.requireRelease(progress, request.releaseId);
    const duplicate = await this.repository.findByChoiceRequest(
      progress.id,
      request.requestKey,
    );
    if (duplicate) return this.toResponse(duplicate);
    this.requireVersion(progress, request.expectedProgressVersion);
    if (progress.status === "COMPLETED") {
      throw new AccountProgressError("PROGRESS_STATE_CONFLICT", 409);
    }

    const engine = this.restoreEngine(progress);
    const before = engine.getState();
    if (
      before.phase !== "awaiting_choice" ||
      before.currentNodeId !== request.sourceNodeCode ||
      !before.currentNode
    ) {
      throw new AccountProgressError("PROGRESS_STATE_CONFLICT", 409);
    }

    let after;
    try {
      after = engine.selectChoice(request.choiceCode);
    } catch (error) {
      throw mapEngineError(error);
    }
    const snapshot = requireSnapshot(engine);
    const status = after.phase === "ended" ? "COMPLETED" : "IN_PROGRESS";

    try {
      const updated = await this.repository.commitChoiceTransition({
        progress,
        expectedVersion: request.expectedProgressVersion,
        requestKey: request.requestKey,
        sourceNodeCode: request.sourceNodeCode,
        choiceCode: request.choiceCode,
        markSourceCompleted: before.currentNode.type === "choice",
        status,
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        targetNodeCode: snapshot.currentNodeId,
        targetNodeCompleted:
          after.phase === "ended" && after.currentNode?.type === "ending",
      });
      return this.toResponse(updated);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  private async requireProgress(userId: string, chapterCode: string) {
    const progress = await this.repository.findByUserAndChapter(userId, chapterCode);
    if (!progress) {
      throw new AccountProgressError("CHAPTER_PROGRESS_NOT_FOUND", 404);
    }
    return progress;
  }

  private requireRelease(progress: StoredChapterProgress, releaseId: string) {
    if (progress.chapterReleaseId !== releaseId) {
      throw new AccountProgressError("PROGRESS_STATE_CONFLICT", 409);
    }
  }

  private requireVersion(progress: StoredChapterProgress, version: number) {
    if (progress.progressVersion !== version) {
      throw new AccountProgressError("PROGRESS_VERSION_CONFLICT", 409);
    }
  }

  private restoreEngine(progress: StoredChapterProgress) {
    const release = readReleaseSnapshot(progress.release.snapshot);
    const engine = new StoryEngine(release.runtimeStory);
    try {
      engine.restore(progress.canonicalSnapshot);
      return engine;
    } catch {
      throw new AccountProgressError("PROGRESS_DATA_INVALID", 503);
    }
  }

  private toResponse(progress: StoredChapterProgress): AccountChapterProgressResponse {
    const release = readReleaseSnapshot(progress.release.snapshot);
    const snapshot = readEngineSnapshot(progress.canonicalSnapshot);
    return {
      release: { id: progress.release.id, version: progress.release.version },
      progress: {
        version: progress.progressVersion,
        status: progress.status === "COMPLETED" ? "completed" : "in_progress",
        currentNodeCode: progress.currentNodeCode,
      },
      chapter: release.chapter,
      engineSnapshot: snapshot,
    };
  }
}

function readReleaseSnapshot(value: unknown): ChapterReleaseSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    !("schemaVersion" in value) ||
    value.schemaVersion !== 1 ||
    !("chapter" in value) ||
    !value.chapter ||
    typeof value.chapter !== "object" ||
    !("runtimeStory" in value) ||
    !value.runtimeStory ||
    typeof value.runtimeStory !== "object"
  ) {
    throw new AccountProgressError("PROGRESS_DATA_INVALID", 503);
  }
  return value as unknown as ChapterReleaseSnapshot;
}

function readEngineSnapshot(value: unknown): StoryEngineSnapshotDto {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("storyId" in value) ||
    typeof value.storyId !== "string" ||
    !("currentNodeId" in value) ||
    typeof value.currentNodeId !== "string" ||
    !("phase" in value) ||
    (value.phase !== "playing" &&
      value.phase !== "awaiting_choice" &&
      value.phase !== "ended") ||
    !("history" in value) ||
    !Array.isArray(value.history) ||
    !value.history.every((node) => typeof node === "string")
  ) {
    throw new AccountProgressError("PROGRESS_DATA_INVALID", 503);
  }
  return value as unknown as StoryEngineSnapshotDto;
}

function requireSnapshot(engine: StoryEngine) {
  const snapshot = engine.getSnapshot();
  if (!snapshot) {
    throw new AccountProgressError("PROGRESS_DATA_INVALID", 503);
  }
  return snapshot;
}

function mapEngineError(error: unknown) {
  return error instanceof StoryEngineError
    ? new AccountProgressError("PROGRESS_STATE_CONFLICT", 409)
    : new AccountProgressError("PROGRESS_DATA_INVALID", 503);
}

function mapStoreError(error: unknown) {
  if (error instanceof ProgressStoreConflictError) {
    return new AccountProgressError(
      error.kind === "VERSION"
        ? "PROGRESS_VERSION_CONFLICT"
        : "PROGRESS_REQUEST_CONFLICT",
      409,
    );
  }
  return error;
}
