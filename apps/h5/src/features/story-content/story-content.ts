import type { RuntimeStoryDefinition } from "@interactive-story/story-core";
import type { StoryEngineSnapshotDto } from "@interactive-story/api-contracts";

import type { VideoAsset } from "../video-assets/video-asset";

export interface StoryContentCharacter {
  code: string;
  name: string;
  avatarUrl: string | null;
  description: string | null;
}

export interface StoryContent {
  source: "api" | "fallback";
  chapterCode: string;
  chapterTitle: string;
  storyTitle: string;
  character: StoryContentCharacter;
  story: RuntimeStoryDefinition;
  videoAssets: Readonly<Record<string, VideoAsset>>;
}

export interface ChoiceSubmissionResult {
  targetNodeId: string;
  engineSnapshot?: StoryEngineSnapshotDto;
}

export type SubmitStoryChoice = (
  nodeId: string,
  choiceId: string,
) => Promise<ChoiceSubmissionResult>;
