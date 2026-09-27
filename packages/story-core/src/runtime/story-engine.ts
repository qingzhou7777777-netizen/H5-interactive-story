import { StoryEngineError } from "./story-engine-error.js";
import type {
  RuntimeStoryDefinition,
  StoryChoice,
  StoryNode,
  StoryNodeId,
} from "./story-node.js";

export type StoryRuntimePhase =
  | "idle"
  | "playing"
  | "awaiting_choice"
  | "ended";

export interface StoryRuntimeState {
  phase: StoryRuntimePhase;
  currentNodeId: StoryNodeId | null;
  currentNode: StoryNode | null;
  availableChoices: readonly StoryChoice[];
  history: readonly StoryNodeId[];
}

export interface StoryRuntimeSnapshot {
  version: 1;
  storyId: string;
  phase: Exclude<StoryRuntimePhase, "idle">;
  currentNodeId: StoryNodeId;
  history: readonly StoryNodeId[];
}

const initialState: StoryRuntimeState = {
  phase: "idle",
  currentNodeId: null,
  currentNode: null,
  availableChoices: [],
  history: [],
};

export class StoryEngine {
  readonly story: RuntimeStoryDefinition;
  private state: StoryRuntimeState = initialState;

  constructor(story: RuntimeStoryDefinition) {
    this.story = story;
  }

  getState(): StoryRuntimeState {
    return {
      ...this.state,
      availableChoices: [...this.state.availableChoices],
      history: [...this.state.history],
    };
  }

  getSnapshot(): StoryRuntimeSnapshot | null {
    if (
      this.state.phase === "idle" ||
      !this.state.currentNodeId ||
      !this.state.currentNode
    ) {
      return null;
    }

    return {
      version: 1,
      storyId: this.story.id,
      phase: this.state.phase,
      currentNodeId: this.state.currentNodeId,
      history: [...this.state.history],
    };
  }

  restore(snapshot: unknown): StoryRuntimeState {
    if (this.state.phase !== "idle") {
      throw new StoryEngineError(
        "STORY_ALREADY_STARTED",
        "剧情已经启动，不能再次恢复进度。",
        this.state.currentNodeId ?? undefined,
      );
    }

    if (!this.isRuntimeSnapshot(snapshot)) {
      throw new StoryEngineError(
        "INVALID_SNAPSHOT",
        "本地剧情进度格式无效。",
      );
    }

    if (snapshot.storyId !== this.story.id) {
      throw new StoryEngineError(
        "INVALID_SNAPSHOT",
        `本地进度属于其他剧情 ${snapshot.storyId}。`,
      );
    }

    if (
      snapshot.history.length === 0 ||
      snapshot.history[0] !== this.story.entryNodeId ||
      snapshot.history.at(-1) !== snapshot.currentNodeId
    ) {
      throw new StoryEngineError(
        "INVALID_SNAPSHOT",
        "本地剧情进度的节点历史无效。",
        snapshot.currentNodeId,
      );
    }

    for (let index = 1; index < snapshot.history.length; index += 1) {
      const previousNodeId = snapshot.history[index - 1]!;
      const nextNodeId = snapshot.history[index]!;
      const previousNode = this.requireNode(previousNodeId);
      this.requireNode(nextNodeId);

      if (!this.canTransition(previousNode, nextNodeId)) {
        throw new StoryEngineError(
          "INVALID_SNAPSHOT",
          `本地剧情进度包含非法跳转：${previousNodeId} → ${nextNodeId}。`,
          nextNodeId,
        );
      }
    }

    const currentNode = this.requireNode(snapshot.currentNodeId);
    const availableChoices = this.getChoicesForRestoredPhase(
      currentNode,
      snapshot.phase,
    );

    this.state = {
      phase: snapshot.phase,
      currentNodeId: currentNode.id,
      currentNode,
      availableChoices,
      history: [...snapshot.history],
    };

    return this.getState();
  }

  start(): StoryRuntimeState {
    if (this.state.phase !== "idle") {
      throw new StoryEngineError(
        "STORY_ALREADY_STARTED",
        "剧情已经启动，不能重复加载入口节点。",
        this.state.currentNodeId ?? undefined,
      );
    }

    return this.enterNode(this.story.entryNodeId);
  }

  completeVideo(): StoryRuntimeState {
    const node = this.requireCurrentNode();

    if (this.state.phase !== "playing" || node.type !== "video") {
      throw new StoryEngineError(
        "INVALID_TRANSITION",
        `当前状态 ${this.state.phase} 不能完成视频播放。`,
        node.id,
      );
    }

    switch (node.onComplete.type) {
      case "choices": {
        if (node.onComplete.choices.length === 0) {
          throw new StoryEngineError(
            "INVALID_NODE_CONFIGURATION",
            `视频节点 ${node.id} 没有可显示的剧情选项。`,
            node.id,
          );
        }

        this.state = {
          ...this.state,
          phase: "awaiting_choice",
          availableChoices: [...node.onComplete.choices],
        };
        return this.getState();
      }

      case "next":
        return this.enterNode(node.onComplete.targetNodeId);

      case "end":
        this.state = {
          ...this.state,
          phase: "ended",
          availableChoices: [],
        };
        return this.getState();
    }
  }

  selectChoice(choiceId: string): StoryRuntimeState {
    const node = this.requireCurrentNode();

    if (this.state.phase !== "awaiting_choice") {
      throw new StoryEngineError(
        "INVALID_TRANSITION",
        `当前状态 ${this.state.phase} 不能选择剧情分支。`,
        node.id,
      );
    }

    const choice = this.state.availableChoices.find(
      (candidate) => candidate.id === choiceId,
    );

    if (!choice) {
      throw new StoryEngineError(
        "CHOICE_NOT_FOUND",
        `当前节点 ${node.id} 不存在选项 ${choiceId}。`,
        node.id,
      );
    }

    return this.enterNode(choice.targetNodeId);
  }

  private requireCurrentNode(): StoryNode {
    if (!this.state.currentNode) {
      throw new StoryEngineError(
        "STORY_NOT_STARTED",
        "剧情尚未启动，请先加载入口节点。",
      );
    }

    return this.state.currentNode;
  }

  private requireNode(nodeId: StoryNodeId): StoryNode {
    const node = this.story.nodes[nodeId];

    if (!node) {
      throw new StoryEngineError(
        "NODE_NOT_FOUND",
        `剧情节点 ${nodeId} 不存在。`,
        nodeId,
      );
    }

    return node;
  }

  private isRuntimeSnapshot(value: unknown): value is StoryRuntimeSnapshot {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    const validPhase =
      candidate.phase === "playing" ||
      candidate.phase === "awaiting_choice" ||
      candidate.phase === "ended";

    return (
      candidate.version === 1 &&
      typeof candidate.storyId === "string" &&
      validPhase &&
      typeof candidate.currentNodeId === "string" &&
      Array.isArray(candidate.history) &&
      candidate.history.every((nodeId) => typeof nodeId === "string")
    );
  }

  private canTransition(node: StoryNode, targetNodeId: StoryNodeId) {
    if (node.type === "choice") {
      return node.choices.some((choice) => choice.targetNodeId === targetNodeId);
    }

    if (node.type === "video") {
      if (node.onComplete.type === "next") {
        return node.onComplete.targetNodeId === targetNodeId;
      }

      if (node.onComplete.type === "choices") {
        return node.onComplete.choices.some(
          (choice) => choice.targetNodeId === targetNodeId,
        );
      }
    }

    return false;
  }

  private getChoicesForRestoredPhase(
    node: StoryNode,
    phase: Exclude<StoryRuntimePhase, "idle">,
  ): readonly StoryChoice[] {
    if (phase === "playing" && node.type === "video") {
      return [];
    }

    if (phase === "awaiting_choice") {
      if (node.type === "choice" && node.choices.length > 0) {
        return [...node.choices];
      }

      if (
        node.type === "video" &&
        node.onComplete.type === "choices" &&
        node.onComplete.choices.length > 0
      ) {
        return [...node.onComplete.choices];
      }
    }

    if (
      phase === "ended" &&
      (node.type === "ending" ||
        (node.type === "video" && node.onComplete.type === "end"))
    ) {
      return [];
    }

    throw new StoryEngineError(
      "INVALID_SNAPSHOT",
      `节点 ${node.id} 与恢复状态 ${phase} 不匹配。`,
      node.id,
    );
  }

  private enterNode(nodeId: StoryNodeId): StoryRuntimeState {
    const node = this.requireNode(nodeId);
    const history = [...this.state.history, node.id];

    switch (node.type) {
      case "video":
        this.state = {
          phase: "playing",
          currentNodeId: node.id,
          currentNode: node,
          availableChoices: [],
          history,
        };
        break;

      case "choice":
        if (node.choices.length === 0) {
          throw new StoryEngineError(
            "INVALID_NODE_CONFIGURATION",
            `选择节点 ${node.id} 没有可用选项。`,
            node.id,
          );
        }
        this.state = {
          phase: "awaiting_choice",
          currentNodeId: node.id,
          currentNode: node,
          availableChoices: [...node.choices],
          history,
        };
        break;

      case "ending":
        this.state = {
          phase: "ended",
          currentNodeId: node.id,
          currentNode: node,
          availableChoices: [],
          history,
        };
        break;
    }

    return this.getState();
  }
}
