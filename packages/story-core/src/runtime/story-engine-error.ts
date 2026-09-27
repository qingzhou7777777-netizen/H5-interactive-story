export type StoryEngineErrorCode =
  | "STORY_ALREADY_STARTED"
  | "STORY_NOT_STARTED"
  | "NODE_NOT_FOUND"
  | "CHOICE_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "INVALID_SNAPSHOT"
  | "INVALID_NODE_CONFIGURATION";

export class StoryEngineError extends Error {
  readonly code: StoryEngineErrorCode;
  readonly nodeId: string | undefined;

  constructor(code: StoryEngineErrorCode, message: string, nodeId?: string) {
    super(message);
    this.name = "StoryEngineError";
    this.code = code;
    this.nodeId = nodeId;
  }
}
