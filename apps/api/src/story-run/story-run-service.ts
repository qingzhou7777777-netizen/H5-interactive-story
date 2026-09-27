import type {
  AccountStoryRunResponse,
  ChapterDto,
  CompleteStoryRunVideoRequest,
  SelectExplorationChoiceRequest,
  StartExplorationRunRequest,
  StartReplayRunRequest,
  StoryEngineSnapshotDto,
} from "@interactive-story/api-contracts";
import {
  StoryEngine,
  StoryEngineError,
  type RuntimeStoryDefinition,
  type StoryRuntimeSnapshot,
  type VideoStoryNode,
} from "@interactive-story/story-core";

import type { StoryMapUseCase } from "../story-map/story-map-service.js";
import {
  StoryRunStoreConflictError,
  type StoredRunChapterContext,
  type StoredStoryRun,
  type StoryRunRepository,
} from "./story-run-repository.js";

interface ChapterReleaseSnapshot {
  schemaVersion: 1;
  chapter: ChapterDto;
  runtimeStory: RuntimeStoryDefinition;
}

export type StoryRunErrorCode =
  | "CHAPTER_PROGRESS_NOT_FOUND"
  | "RUN_RELEASE_CONFLICT"
  | "RUN_ENTRY_NOT_FOUND"
  | "RUN_ENTRY_LOCKED"
  | "RUN_ENTRY_NOT_ALLOWED"
  | "RUN_ENTRY_NOT_COMPLETED"
  | "STORY_RUN_NOT_FOUND"
  | "STORY_RUN_MODE_CONFLICT"
  | "STORY_RUN_ALREADY_ACTIVE"
  | "STORY_RUN_VERSION_CONFLICT"
  | "STORY_RUN_STATE_CONFLICT"
  | "STORY_RUN_REQUEST_CONFLICT"
  | "STORY_RUN_DATA_INVALID";

const errorMessages: Record<StoryRunErrorCode, string> = {
  CHAPTER_PROGRESS_NOT_FOUND: "当前账号尚未开始该章节。",
  RUN_RELEASE_CONFLICT: "运行请求与当前章节发布版本不一致。",
  RUN_ENTRY_NOT_FOUND: "指定剧情节点未发现或不存在。",
  RUN_ENTRY_LOCKED: "指定剧情节点尚未解锁。",
  RUN_ENTRY_NOT_ALLOWED: "指定剧情节点不允许执行该操作。",
  RUN_ENTRY_NOT_COMPLETED: "只有已完成节点可以重播。",
  STORY_RUN_NOT_FOUND: "剧情运行不存在。",
  STORY_RUN_MODE_CONFLICT: "剧情运行类型与当前操作不匹配。",
  STORY_RUN_ALREADY_ACTIVE: "当前章节已有进行中的探索或重播运行。",
  STORY_RUN_VERSION_CONFLICT: "剧情运行已在其他请求中更新，请刷新后重试。",
  STORY_RUN_STATE_CONFLICT: "当前剧情运行状态不能执行该操作。",
  STORY_RUN_REQUEST_CONFLICT: "请求幂等键已被其他运行操作使用。",
  STORY_RUN_DATA_INVALID: "服务端剧情运行数据无效。",
};

export class StoryRunError extends Error {
  constructor(
    public readonly code: StoryRunErrorCode,
    public readonly statusCode: 403 | 404 | 409 | 503,
  ) {
    super(errorMessages[code]);
    this.name = "StoryRunError";
  }
}

export interface StoryRunUseCase {
  startExploration(
    userId: string,
    chapterCode: string,
    request: StartExplorationRunRequest,
  ): Promise<AccountStoryRunResponse>;
  getExplorationRun(
    userId: string,
    chapterCode: string,
    runId: string,
  ): Promise<AccountStoryRunResponse>;
  completeExplorationVideo(
    userId: string,
    chapterCode: string,
    runId: string,
    request: CompleteStoryRunVideoRequest,
  ): Promise<AccountStoryRunResponse>;
  selectExplorationChoice(
    userId: string,
    chapterCode: string,
    runId: string,
    request: SelectExplorationChoiceRequest,
  ): Promise<AccountStoryRunResponse>;
  abandonExplorationRun(
    userId: string,
    chapterCode: string,
    runId: string,
    expectedRunVersion: number,
  ): Promise<AccountStoryRunResponse>;
  startReplay(
    userId: string,
    chapterCode: string,
    request: StartReplayRunRequest,
  ): Promise<AccountStoryRunResponse>;
  completeReplayVideo(
    userId: string,
    chapterCode: string,
    runId: string,
    request: CompleteStoryRunVideoRequest,
  ): Promise<AccountStoryRunResponse>;
}

export class StoryRunService implements StoryRunUseCase {
  constructor(
    private readonly repository: StoryRunRepository,
    private readonly storyMap: StoryMapUseCase,
  ) {}

  async startExploration(
    userId: string,
    chapterCode: string,
    request: StartExplorationRunRequest,
  ) {
    const duplicate = await this.repository.findByStartRequest(request.requestKey);
    if (duplicate) {
      this.requireMatchingStart(
        duplicate,
        userId,
        chapterCode,
        request.releaseId,
        "EXPLORATION",
        request.entryNodeCode,
      );
      return this.toResponse(duplicate);
    }

    const [context, map] = await Promise.all([
      this.requireChapterContext(userId, chapterCode),
      this.storyMap.getMap(userId, chapterCode),
    ]);
    this.requireRelease(context, request.releaseId, map.release.id);
    const mapNode = findMapNode(map, request.entryNodeCode);
    if (!mapNode) throw new StoryRunError("RUN_ENTRY_NOT_FOUND", 404);
    if (mapNode.state === "discovered_locked") {
      throw new StoryRunError("RUN_ENTRY_LOCKED", 403);
    }
    if (!mapNode.actions.canExplore) {
      throw new StoryRunError("RUN_ENTRY_NOT_ALLOWED", 403);
    }

    const release = readReleaseSnapshot(context.release.snapshot);
    const runtime = createExplorationRuntime(
      release.runtimeStory,
      request.entryNodeCode,
    );
    const { state, snapshot } = startEngine(runtime);

    try {
      const run = await this.repository.createRun({
        ...context,
        mode: "EXPLORATION",
        status: state.phase === "ended" ? "COMPLETED" : "ACTIVE",
        entryNodeCode: request.entryNodeCode,
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        startRequestKey: request.requestKey,
        initialNodeCompleted: state.phase === "ended",
      });
      return this.toResponse(run);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async getExplorationRun(userId: string, chapterCode: string, runId: string) {
    const run = await this.requireRun(userId, chapterCode, runId, "EXPLORATION");
    this.restoreEngine(run);
    return this.toResponse(run);
  }

  async completeExplorationVideo(
    userId: string,
    chapterCode: string,
    runId: string,
    request: CompleteStoryRunVideoRequest,
  ) {
    return this.completeVideo(
      userId,
      chapterCode,
      runId,
      request,
      "EXPLORATION",
    );
  }

  async selectExplorationChoice(
    userId: string,
    chapterCode: string,
    runId: string,
    request: SelectExplorationChoiceRequest,
  ) {
    const run = await this.requireRun(userId, chapterCode, runId, "EXPLORATION");
    const duplicate = await this.findChoiceDuplicate(run, request.requestKey);
    if (duplicate) {
      this.restoreEngine(duplicate);
      return this.toResponse(duplicate);
    }
    this.requireActiveVersion(run, request.expectedRunVersion);

    const engine = this.restoreEngine(run);
    const before = engine.getState();
    if (
      before.phase !== "awaiting_choice" ||
      before.currentNodeId !== request.sourceNodeCode ||
      !before.currentNode
    ) {
      throw new StoryRunError("STORY_RUN_STATE_CONFLICT", 409);
    }

    let after;
    try {
      after = engine.selectChoice(request.choiceCode);
    } catch (error) {
      throw mapEngineError(error);
    }
    const snapshot = requireSnapshot(engine);

    try {
      const updated = await this.repository.commitChoiceTransition({
        run,
        expectedVersion: request.expectedRunVersion,
        requestKey: request.requestKey,
        sourceNodeCode: request.sourceNodeCode,
        choiceCode: request.choiceCode,
        status: after.phase === "ended" ? "COMPLETED" : "ACTIVE",
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        targetNodeCode: snapshot.currentNodeId,
        enteredTargetNode: after.history.length > before.history.length,
        targetNodeCompleted:
          after.phase === "ended" && after.currentNode?.type === "ending",
      });
      return this.toResponse(updated);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async abandonExplorationRun(
    userId: string,
    chapterCode: string,
    runId: string,
    expectedRunVersion: number,
  ) {
    const run = await this.requireRun(userId, chapterCode, runId, "EXPLORATION");
    if (run.status === "ABANDONED") return this.toResponse(run);
    this.requireActiveVersion(run, expectedRunVersion);
    try {
      return this.toResponse(await this.repository.abandonRun(run, expectedRunVersion));
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async startReplay(
    userId: string,
    chapterCode: string,
    request: StartReplayRunRequest,
  ) {
    const duplicate = await this.repository.findByStartRequest(request.requestKey);
    if (duplicate) {
      this.requireMatchingStart(
        duplicate,
        userId,
        chapterCode,
        request.releaseId,
        "REPLAY",
        request.nodeCode,
      );
      return this.toResponse(duplicate);
    }

    const [context, map] = await Promise.all([
      this.requireChapterContext(userId, chapterCode),
      this.storyMap.getMap(userId, chapterCode),
    ]);
    this.requireRelease(context, request.releaseId, map.release.id);
    const mapNode = findMapNode(map, request.nodeCode);
    if (!mapNode) throw new StoryRunError("RUN_ENTRY_NOT_FOUND", 404);
    if (mapNode.state !== "completed") {
      throw new StoryRunError("RUN_ENTRY_NOT_COMPLETED", 403);
    }
    if (!mapNode.actions.canReplay) {
      throw new StoryRunError("RUN_ENTRY_NOT_ALLOWED", 403);
    }

    const release = readReleaseSnapshot(context.release.snapshot);
    const runtime = createReplayRuntime(release.runtimeStory, request.nodeCode);
    const { state, snapshot } = startEngine(runtime);

    try {
      const run = await this.repository.createRun({
        ...context,
        mode: "REPLAY",
        status: state.phase === "ended" ? "COMPLETED" : "ACTIVE",
        entryNodeCode: request.nodeCode,
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        startRequestKey: request.requestKey,
        initialNodeCompleted: state.phase === "ended",
      });
      return this.toResponse(run);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  async completeReplayVideo(
    userId: string,
    chapterCode: string,
    runId: string,
    request: CompleteStoryRunVideoRequest,
  ) {
    return this.completeVideo(userId, chapterCode, runId, request, "REPLAY");
  }

  private async completeVideo(
    userId: string,
    chapterCode: string,
    runId: string,
    request: CompleteStoryRunVideoRequest,
    mode: StoredStoryRun["mode"],
  ) {
    const run = await this.requireRun(userId, chapterCode, runId, mode);
    const duplicate = await this.findVideoDuplicate(run, request.requestKey);
    if (duplicate) {
      this.restoreEngine(duplicate);
      return this.toResponse(duplicate);
    }
    this.requireActiveVersion(run, request.expectedRunVersion);

    const engine = this.restoreEngine(run);
    const before = engine.getState();
    if (
      before.phase !== "playing" ||
      before.currentNode?.type !== "video" ||
      before.currentNodeId !== request.nodeCode
    ) {
      throw new StoryRunError("STORY_RUN_STATE_CONFLICT", 409);
    }

    let after;
    try {
      after = engine.completeVideo();
    } catch (error) {
      throw mapEngineError(error);
    }
    if (mode === "REPLAY" && after.phase !== "ended") {
      throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
    }
    const snapshot = requireSnapshot(engine);

    try {
      const updated = await this.repository.commitVideoTransition({
        run,
        expectedVersion: request.expectedRunVersion,
        requestKey: request.requestKey,
        sourceNodeCode: request.nodeCode,
        status: after.phase === "ended" ? "COMPLETED" : "ACTIVE",
        currentNodeCode: snapshot.currentNodeId,
        canonicalSnapshot: snapshot,
        targetNodeCode: snapshot.currentNodeId,
        enteredTargetNode: after.history.length > before.history.length,
        targetNodeCompleted:
          after.phase === "ended" && after.currentNode?.type === "ending",
      });
      return this.toResponse(updated);
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  private async requireChapterContext(userId: string, chapterCode: string) {
    const context = await this.repository.findChapterContext(userId, chapterCode);
    if (!context) {
      throw new StoryRunError("CHAPTER_PROGRESS_NOT_FOUND", 404);
    }
    return context;
  }

  private async requireRun(
    userId: string,
    chapterCode: string,
    runId: string,
    mode: StoredStoryRun["mode"],
  ) {
    const run = await this.repository.findRun(userId, chapterCode, runId);
    if (!run) throw new StoryRunError("STORY_RUN_NOT_FOUND", 404);
    if (run.mode !== mode) {
      throw new StoryRunError("STORY_RUN_MODE_CONFLICT", 409);
    }
    return run;
  }

  private requireRelease(
    context: StoredRunChapterContext,
    requestedReleaseId: string,
    mapReleaseId: string,
  ) {
    if (
      context.release.id !== requestedReleaseId ||
      mapReleaseId !== requestedReleaseId
    ) {
      throw new StoryRunError("RUN_RELEASE_CONFLICT", 409);
    }
  }

  private requireMatchingStart(
    run: StoredStoryRun,
    userId: string,
    chapterCode: string,
    releaseId: string,
    mode: StoredStoryRun["mode"],
    entryNodeCode: string,
  ) {
    if (
      run.userId !== userId ||
      run.chapterCode !== chapterCode ||
      run.release.id !== releaseId ||
      run.mode !== mode ||
      run.entryNodeCode !== entryNodeCode
    ) {
      throw new StoryRunError("STORY_RUN_REQUEST_CONFLICT", 409);
    }
    this.restoreEngine(run);
  }

  private requireActiveVersion(run: StoredStoryRun, expectedVersion: number) {
    if (run.status !== "ACTIVE") {
      throw new StoryRunError("STORY_RUN_STATE_CONFLICT", 409);
    }
    if (run.runVersion !== expectedVersion) {
      throw new StoryRunError("STORY_RUN_VERSION_CONFLICT", 409);
    }
  }

  private async findVideoDuplicate(run: StoredStoryRun, requestKey: string) {
    try {
      const duplicate = await this.repository.findByVideoRequest(run.id, requestKey);
      if (duplicate) this.requireSameRun(run, duplicate);
      return duplicate;
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  private async findChoiceDuplicate(run: StoredStoryRun, requestKey: string) {
    try {
      const duplicate = await this.repository.findByChoiceRequest(run.id, requestKey);
      if (duplicate) this.requireSameRun(run, duplicate);
      return duplicate;
    } catch (error) {
      throw mapStoreError(error);
    }
  }

  private requireSameRun(expected: StoredStoryRun, actual: StoredStoryRun) {
    if (
      expected.id !== actual.id ||
      expected.userId !== actual.userId ||
      expected.chapterCode !== actual.chapterCode
    ) {
      throw new StoryRunError("STORY_RUN_REQUEST_CONFLICT", 409);
    }
  }

  private restoreEngine(run: StoredStoryRun) {
    const release = readReleaseSnapshot(run.release.snapshot);
    const runtime =
      run.mode === "EXPLORATION"
        ? createExplorationRuntime(release.runtimeStory, run.entryNodeCode)
        : createReplayRuntime(release.runtimeStory, run.entryNodeCode);
    const engine = new StoryEngine(runtime);
    try {
      engine.restore(run.canonicalSnapshot);
      return engine;
    } catch {
      throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
    }
  }

  private toResponse(run: StoredStoryRun): AccountStoryRunResponse {
    const release = readReleaseSnapshot(run.release.snapshot);
    const snapshot = readEngineSnapshot(run.canonicalSnapshot);
    return {
      release: { id: run.release.id, version: run.release.version },
      run: {
        id: run.id,
        mode: run.mode === "EXPLORATION" ? "exploration" : "replay",
        status:
          run.status === "ACTIVE"
            ? "active"
            : run.status === "COMPLETED"
              ? "completed"
              : "abandoned",
        version: run.runVersion,
        entryNodeCode: run.entryNodeCode,
        currentNodeCode: run.currentNodeCode,
      },
      chapter: release.chapter,
      engineSnapshot: snapshot,
    };
  }
}

function findMapNode(
  map: Awaited<ReturnType<StoryMapUseCase["getMap"]>>,
  nodeCode: string,
) {
  return map.regions
    .flatMap((region) => region.nodes)
    .find((node) => node.nodeCode === nodeCode);
}

function createExplorationRuntime(
  runtime: RuntimeStoryDefinition,
  entryNodeCode: string,
): RuntimeStoryDefinition {
  if (!runtime.nodes[entryNodeCode]) {
    throw new StoryRunError("RUN_ENTRY_NOT_FOUND", 404);
  }
  return {
    ...runtime,
    id: `${runtime.id}:exploration:${entryNodeCode}`,
    entryNodeId: entryNodeCode,
  };
}

function createReplayRuntime(
  runtime: RuntimeStoryDefinition,
  nodeCode: string,
): RuntimeStoryDefinition {
  const node = runtime.nodes[nodeCode];
  if (!node) throw new StoryRunError("RUN_ENTRY_NOT_FOUND", 404);
  if (node.type !== "video") {
    throw new StoryRunError("RUN_ENTRY_NOT_ALLOWED", 403);
  }
  const replayNode: VideoStoryNode = {
    ...node,
    onComplete: { type: "end" },
  };
  return {
    id: `${runtime.id}:replay:${nodeCode}`,
    title: runtime.title,
    entryNodeId: nodeCode,
    nodes: { [nodeCode]: replayNode },
  };
}

function startEngine(runtime: RuntimeStoryDefinition) {
  const engine = new StoryEngine(runtime);
  try {
    const state = engine.start();
    return { state, snapshot: requireSnapshot(engine) };
  } catch {
    throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
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
    throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
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
    throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
  }
  return value as unknown as StoryEngineSnapshotDto;
}

function requireSnapshot(engine: StoryEngine): StoryRuntimeSnapshot {
  const snapshot = engine.getSnapshot();
  if (!snapshot) throw new StoryRunError("STORY_RUN_DATA_INVALID", 503);
  return snapshot;
}

function mapEngineError(error: unknown) {
  return error instanceof StoryEngineError
    ? new StoryRunError("STORY_RUN_STATE_CONFLICT", 409)
    : new StoryRunError("STORY_RUN_DATA_INVALID", 503);
}

function mapStoreError(error: unknown) {
  if (error instanceof StoryRunStoreConflictError) {
    const code: StoryRunErrorCode =
      error.kind === "ACTIVE_RUN"
        ? "STORY_RUN_ALREADY_ACTIVE"
        : error.kind === "VERSION"
          ? "STORY_RUN_VERSION_CONFLICT"
          : error.kind === "REQUEST"
            ? "STORY_RUN_REQUEST_CONFLICT"
            : "STORY_RUN_STATE_CONFLICT";
    return new StoryRunError(code, 409);
  }
  return error;
}
