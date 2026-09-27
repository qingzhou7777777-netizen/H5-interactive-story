export interface HealthResponse {
  status: "ok";
  service: string;
  timestamp: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type StoryNodeTypeDto = "video" | "choice" | "ending";
export type CompletionModeDto = "choices" | "next" | "end";
export type AccessModeDto = "free" | "payment";

export interface StoryDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
}

export interface CharacterDto {
  code: string;
  name: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  description: string | null;
}

export interface ChoiceDto {
  id: string;
  label: string;
  targetNodeId: string;
  sortOrder: number;
}

export interface NodeDto {
  id: string;
  title: string;
  type: StoryNodeTypeDto;
  completionMode: CompletionModeDto;
  message: string | null;
  videoAssetId: string | null;
  nextNodeId: string | null;
  accessMode: AccessModeDto;
  choices: ChoiceDto[];
}

export interface VideoAssetDto {
  id: string;
  playbackUrl: string;
  posterUrl: string | null;
  mimeType: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
}

export interface ChapterDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  entryNodeId: string;
  story: StoryDto;
  character: CharacterDto;
  nodes: NodeDto[];
  videoAssets: VideoAssetDto[];
}

export interface SubmitChoiceRequest {
  nodeId: string;
  choiceId: string;
}

export interface SubmitChoiceResponse {
  accepted: true;
  sourceNodeId: string;
  choiceId: string;
  targetNodeId: string;
}

export * from "./admin.js";
export * from "./account.js";
export * from "./account-progress.js";
export * from "./analytics.js";
export * from "./story-map.js";
export * from "./story-run.js";
