import type { StoryRuntimeSnapshot } from "@interactive-story/story-core";

export interface StoredChapterRelease {
  id: string;
  version: number;
  snapshot: unknown;
}

export interface StoredChapterProgress {
  id: string;
  userId: string;
  chapterReleaseId: string;
  status: "IN_PROGRESS" | "COMPLETED";
  currentNodeCode: string;
  canonicalSnapshot: unknown;
  progressVersion: number;
  release: StoredChapterRelease;
}

export interface CreateChapterProgressInput {
  userId: string;
  release: StoredChapterRelease;
  status: "IN_PROGRESS" | "COMPLETED";
  currentNodeCode: string;
  canonicalSnapshot: StoryRuntimeSnapshot;
  initialNodeCompleted: boolean;
}

interface CommitTransitionBase {
  progress: StoredChapterProgress;
  expectedVersion: number;
  status: "IN_PROGRESS" | "COMPLETED";
  currentNodeCode: string;
  canonicalSnapshot: StoryRuntimeSnapshot;
  targetNodeCode: string;
  targetNodeCompleted: boolean;
}

export interface CommitVideoTransitionInput extends CommitTransitionBase {
  requestKey: string;
  sourceNodeCode: string;
}

export interface CommitChoiceTransitionInput extends CommitTransitionBase {
  requestKey: string;
  sourceNodeCode: string;
  choiceCode: string;
  markSourceCompleted: boolean;
}

export class ProgressStoreConflictError extends Error {
  constructor(public readonly kind: "VERSION" | "REQUEST") {
    super(`Progress store conflict: ${kind}`);
    this.name = "ProgressStoreConflictError";
  }
}

export interface AccountProgressRepository {
  findByUserAndChapter(
    userId: string,
    chapterCode: string,
  ): Promise<StoredChapterProgress | null>;
  findActiveRelease(chapterCode: string): Promise<StoredChapterRelease | null>;
  createProgress(input: CreateChapterProgressInput): Promise<StoredChapterProgress>;
  findByVideoRequest(
    progressId: string,
    requestKey: string,
  ): Promise<StoredChapterProgress | null>;
  findByChoiceRequest(
    progressId: string,
    requestKey: string,
  ): Promise<StoredChapterProgress | null>;
  commitVideoTransition(
    input: CommitVideoTransitionInput,
  ): Promise<StoredChapterProgress>;
  commitChoiceTransition(
    input: CommitChoiceTransitionInput,
  ): Promise<StoredChapterProgress>;
}
