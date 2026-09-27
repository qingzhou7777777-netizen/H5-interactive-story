export type StoryNodeId = string;
export type StoryChoiceId = string;

export interface StoryChoice {
  id: StoryChoiceId;
  label: string;
  targetNodeId: StoryNodeId;
}

export type VideoCompletion =
  | {
      type: "choices";
      choices: readonly StoryChoice[];
    }
  | {
      type: "next";
      targetNodeId: StoryNodeId;
    }
  | {
      type: "end";
    };

interface BaseStoryNode {
  id: StoryNodeId;
  title: string;
}

export interface VideoStoryNode extends BaseStoryNode {
  type: "video";
  videoAssetId?: string;
  onComplete: VideoCompletion;
}

export interface ChoiceStoryNode extends BaseStoryNode {
  type: "choice";
  choices: readonly StoryChoice[];
}

export interface EndingStoryNode extends BaseStoryNode {
  type: "ending";
  message?: string;
}

export type StoryNode = VideoStoryNode | ChoiceStoryNode | EndingStoryNode;

export interface RuntimeStoryDefinition {
  id: string;
  title: string;
  entryNodeId: StoryNodeId;
  nodes: Readonly<Record<StoryNodeId, StoryNode>>;
}
