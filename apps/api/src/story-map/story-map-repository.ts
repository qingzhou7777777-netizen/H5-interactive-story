export type StoredPrerequisitePurpose = "DISCOVERY" | "UNLOCK";
export type StoredPrerequisiteFactType =
  | "CHAPTER_STARTED"
  | "NODE_DISCOVERED"
  | "NODE_COMPLETED"
  | "CHOICE_SELECTED";
export type StoredPrerequisiteSourceScope =
  | "MAINLINE_ONLY"
  | "EXPLORATION_ONLY"
  | "ANY";

export interface StoredNodePrerequisite {
  purpose: StoredPrerequisitePurpose;
  groupCode: string;
  factType: StoredPrerequisiteFactType;
  requiredNodeCode: string | null;
  requiredChoiceCode: string | null;
  sourceScope: StoredPrerequisiteSourceScope;
  sortOrder: number;
}

export interface StoredStoryMapNode {
  nodeCode: string;
  displayTitle: string;
  description: string | null;
  coverUrl: string | null;
  positionX: number;
  positionY: number;
  sortOrder: number;
  allowExploration: boolean;
  allowReplay: boolean;
  prerequisites: StoredNodePrerequisite[];
}

export interface StoredStoryMapRegion {
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  layoutMetadata: unknown | null;
  nodes: StoredStoryMapNode[];
}

export interface StoredMainlineNodeFact {
  nodeCode: string;
  available: boolean;
  completed: boolean;
}

export interface StoredChoiceFact {
  sourceNodeCode: string;
  choiceCode: string;
}

export interface StoredExplorationNodeFact {
  nodeCode: string;
  completed: boolean;
}

export interface StoredExplorationRunFacts {
  mode: "EXPLORATION" | "REPLAY";
  nodes: StoredExplorationNodeFact[];
  choices: StoredChoiceFact[];
}

export interface StoredStoryMapContext {
  release: {
    id: string;
    version: number;
  };
  progress: {
    status: "IN_PROGRESS" | "COMPLETED";
    currentNodeCode: string;
  };
  regions: StoredStoryMapRegion[];
  mainlineNodes: StoredMainlineNodeFact[];
  mainlineChoices: StoredChoiceFact[];
  explorationRuns: StoredExplorationRunFacts[];
}

export interface StoryMapRepository {
  findByUserAndChapter(
    userId: string,
    chapterCode: string,
  ): Promise<StoredStoryMapContext | null>;
}
