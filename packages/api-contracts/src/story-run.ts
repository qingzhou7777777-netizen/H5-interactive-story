import type { ChapterDto } from "./index.js";
import type { StoryEngineSnapshotDto } from "./account-progress.js";

export interface StartExplorationRunRequest {
  releaseId: string;
  entryNodeCode: string;
  requestKey: string;
}

export interface StartReplayRunRequest {
  releaseId: string;
  nodeCode: string;
  requestKey: string;
}

export interface CompleteStoryRunVideoRequest {
  nodeCode: string;
  expectedRunVersion: number;
  requestKey: string;
}

export interface SelectExplorationChoiceRequest {
  sourceNodeCode: string;
  choiceCode: string;
  expectedRunVersion: number;
  requestKey: string;
}

export interface AbandonExplorationRunRequest {
  expectedRunVersion: number;
}

export interface AccountStoryRunResponse {
  release: {
    id: string;
    version: number;
  };
  run: {
    id: string;
    mode: "exploration" | "replay";
    status: "active" | "completed" | "abandoned";
    version: number;
    entryNodeCode: string;
    currentNodeCode: string;
  };
  chapter: ChapterDto;
  engineSnapshot: StoryEngineSnapshotDto;
}
