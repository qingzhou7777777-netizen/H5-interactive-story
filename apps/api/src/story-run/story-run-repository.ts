import type { StoryRuntimeSnapshot } from "@interactive-story/story-core";

export interface StoredRunRelease {
  id: string;
  version: number;
  snapshot: unknown;
}

export interface StoredRunChapterContext {
  progressId: string;
  userId: string;
  chapterCode: string;
  release: StoredRunRelease;
}

export interface StoredStoryRun extends StoredRunChapterContext {
  id: string;
  mode: "EXPLORATION" | "REPLAY";
  status: "ACTIVE" | "COMPLETED" | "ABANDONED";
  entryNodeCode: string;
  currentNodeCode: string;
  canonicalSnapshot: unknown;
  runVersion: number;
  startRequestKey: string;
}

export interface CreateStoryRunInput extends StoredRunChapterContext {
  mode: "EXPLORATION" | "REPLAY";
  status: "ACTIVE" | "COMPLETED";
  entryNodeCode: string;
  currentNodeCode: string;
  canonicalSnapshot: StoryRuntimeSnapshot;
  startRequestKey: string;
  initialNodeCompleted: boolean;
}

interface CommitRunTransitionBase {
  run: StoredStoryRun;
  expectedVersion: number;
  status: "ACTIVE" | "COMPLETED";
  currentNodeCode: string;
  canonicalSnapshot: StoryRuntimeSnapshot;
  sourceNodeCode: string;
  targetNodeCode: string;
  enteredTargetNode: boolean;
  targetNodeCompleted: boolean;
}

export interface CommitRunVideoInput extends CommitRunTransitionBase {
  requestKey: string;
}

export interface CommitRunChoiceInput extends CommitRunTransitionBase {
  requestKey: string;
  choiceCode: string;
}

export class StoryRunStoreConflictError extends Error {
  constructor(
    public readonly kind: "ACTIVE_RUN" | "VERSION" | "REQUEST" | "STATE",
  ) {
    super(`Story run store conflict: ${kind}`);
    this.name = "StoryRunStoreConflictError";
  }
}

export interface StoryRunRepository {
  findChapterContext(
    userId: string,
    chapterCode: string,
  ): Promise<StoredRunChapterContext | null>;
  findByStartRequest(requestKey: string): Promise<StoredStoryRun | null>;
  findRun(
    userId: string,
    chapterCode: string,
    runId: string,
  ): Promise<StoredStoryRun | null>;
  findByVideoRequest(
    runId: string,
    requestKey: string,
  ): Promise<StoredStoryRun | null>;
  findByChoiceRequest(
    runId: string,
    requestKey: string,
  ): Promise<StoredStoryRun | null>;
  createRun(input: CreateStoryRunInput): Promise<StoredStoryRun>;
  commitVideoTransition(input: CommitRunVideoInput): Promise<StoredStoryRun>;
  commitChoiceTransition(input: CommitRunChoiceInput): Promise<StoredStoryRun>;
  abandonRun(
    run: StoredStoryRun,
    expectedVersion: number,
  ): Promise<StoredStoryRun>;
}
