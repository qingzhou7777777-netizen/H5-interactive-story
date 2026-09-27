export type ContentStatus = "draft" | "active" | "disabled";
export type StoryNodeType = "video" | "choice" | "ending";
export type CompletionMode = "choices" | "next" | "end";
export type AccessMode = "free" | "payment";

export interface CharacterDefinition {
  code: string;
  name: string;
  avatarUrl?: string;
  coverUrl?: string;
  description?: string;
}

export interface ChapterDefinition {
  code: string;
  title: string;
  description?: string;
  characterCode: string;
  entryNodeCode: string;
}

export interface StoryNodeDefinition {
  code: string;
  title: string;
  type: StoryNodeType;
  completionMode: CompletionMode;
  videoAssetId?: string;
  nextNodeCode?: string;
  accessMode: AccessMode;
  accessKey?: string;
}

export interface StoryChoiceDefinition {
  code: string;
  sourceNodeCode: string;
  label: string;
  targetNodeCode: string;
  sortOrder: number;
  enabled: boolean;
}

export interface StoryGraph {
  chapter: ChapterDefinition;
  nodes: StoryNodeDefinition[];
  choices: StoryChoiceDefinition[];
}

export interface StoryReleaseSnapshot {
  version: number;
  generatedAt: string;
  characters: CharacterDefinition[];
  graph: StoryGraph;
}
