import type { ChapterDto } from "./index.js";

export interface StoryEngineSnapshotDto {
  version: 1;
  storyId: string;
  phase: "playing" | "awaiting_choice" | "ended";
  currentNodeId: string;
  history: readonly string[];
}

export interface AccountChapterProgressResponse {
  release: {
    id: string;
    version: number;
  };
  progress: {
    version: number;
    status: "in_progress" | "completed";
    currentNodeCode: string;
  };
  chapter: ChapterDto;
  engineSnapshot: StoryEngineSnapshotDto;
}

export interface CompleteAccountVideoRequest {
  releaseId: string;
  nodeCode: string;
  expectedProgressVersion: number;
  requestKey: string;
}

export interface SelectAccountChoiceRequest {
  releaseId: string;
  sourceNodeCode: string;
  choiceCode: string;
  expectedProgressVersion: number;
  requestKey: string;
}
