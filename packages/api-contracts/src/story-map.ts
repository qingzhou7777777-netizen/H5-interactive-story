export type StoryMapNodeState =
  | "discovered_locked"
  | "available"
  | "completed";

export interface AccountStoryMapNodeDto {
  nodeCode: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  position: {
    x: number;
    y: number;
  };
  sortOrder: number;
  state: StoryMapNodeState;
  actions: {
    canExplore: boolean;
    canReplay: boolean;
  };
}

export interface AccountStoryMapRegionDto {
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  layoutMetadata: unknown | null;
  nodes: AccountStoryMapNodeDto[];
}

export interface AccountStoryMapResponse {
  release: {
    id: string;
    version: number;
  };
  progress: {
    status: "in_progress" | "completed";
    currentNodeCode: string;
  };
  regions: AccountStoryMapRegionDto[];
}
