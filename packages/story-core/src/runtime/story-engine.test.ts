import { describe, expect, it } from "vitest";

import { localTestStory } from "../fixtures/local-test-story.js";
import { StoryEngine } from "./story-engine.js";
import { StoryEngineError } from "./story-engine-error.js";
import type { RuntimeStoryDefinition } from "./story-node.js";

function captureStoryError(action: () => unknown) {
  let caughtError: unknown;

  try {
    action();
  } catch (error) {
    caughtError = error;
  }

  expect(caughtError).toBeInstanceOf(StoryEngineError);
  return caughtError as StoryEngineError;
}

function startAtChoices(story: RuntimeStoryDefinition = localTestStory) {
  const engine = new StoryEngine(story);
  const started = engine.start();

  expect(started.phase).toBe("playing");
  expect(started.currentNodeId).toBe("Node001");

  const awaitingChoice = engine.completeVideo();
  expect(awaitingChoice.phase).toBe("awaiting_choice");

  return engine;
}

describe("StoryEngine", () => {
  it.each([
    ["A", "Node002", "Ending002"],
    ["B", "Node003", "Ending003"],
    ["C", "Node004", "Ending004"],
  ])(
    "routes choice %s through video %s to %s",
    (choiceId, targetNodeId, endingNodeId) => {
      const engine = startAtChoices();
      const branchVideoState = engine.selectChoice(choiceId);

      expect(branchVideoState.currentNodeId).toBe(targetNodeId);
      expect(branchVideoState.currentNode?.type).toBe("video");
      expect(branchVideoState.phase).toBe("playing");
      expect(branchVideoState.history).toEqual(["Node001", targetNodeId]);

      const endingState = engine.completeVideo();
      expect(endingState.currentNodeId).toBe(endingNodeId);
      expect(endingState.currentNode?.type).toBe("ending");
      expect(endingState.phase).toBe("ended");
      expect(endingState.history).toEqual(["Node001", targetNodeId, endingNodeId]);
    },
  );

  it("throws when a choice targets a missing node", () => {
    const invalidStory: RuntimeStoryDefinition = {
      ...localTestStory,
      nodes: {
        ...localTestStory.nodes,
        Node001: {
          ...localTestStory.nodes.Node001!,
          type: "video",
          onComplete: {
            type: "choices",
            choices: [
              {
                id: "A",
                label: "非法跳转",
                targetNodeId: "Node999",
              },
            ],
          },
        },
      },
    };
    const engine = startAtChoices(invalidStory);
    const error = captureStoryError(() => engine.selectChoice("A"));

    expect(error).toMatchObject({
      code: "NODE_NOT_FOUND",
      nodeId: "Node999",
    });

    expect(engine.getState().currentNodeId).toBe("Node001");
    expect(engine.getState().phase).toBe("awaiting_choice");
  });

  it("does not allow an ending node to transition again", () => {
    const engine = startAtChoices();
    engine.selectChoice("A");
    engine.completeVideo();

    expect(captureStoryError(() => engine.selectChoice("B"))).toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(captureStoryError(() => engine.completeVideo())).toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect(engine.getState().currentNodeId).toBe("Ending002");
    expect(engine.getState().phase).toBe("ended");
  });

  it("loads a standalone choice node without playing video", () => {
    const story: RuntimeStoryDefinition = {
      id: "choice-entry-test",
      title: "选择节点测试",
      entryNodeId: "Choice001",
      nodes: {
        Choice001: {
          id: "Choice001",
          type: "choice",
          title: "请选择",
          choices: [
            {
              id: "continue",
              label: "继续",
              targetNodeId: "Ending001",
            },
          ],
        },
        Ending001: {
          id: "Ending001",
          type: "ending",
          title: "结束",
        },
      },
    };

    const engine = new StoryEngine(story);
    expect(engine.start().phase).toBe("awaiting_choice");
    expect(engine.selectChoice("continue").phase).toBe("ended");
  });

  it("restores an awaiting-choice state after refresh", () => {
    const sourceEngine = startAtChoices();
    const snapshot = sourceEngine.getSnapshot();
    const restoredEngine = new StoryEngine(localTestStory);

    expect(snapshot).not.toBeNull();
    expect(restoredEngine.restore(snapshot)).toMatchObject({
      phase: "awaiting_choice",
      currentNodeId: "Node001",
    });
    expect(restoredEngine.getState().availableChoices.map((choice) => choice.id)).toEqual([
      "A",
      "B",
      "C",
    ]);
  });

  it("restores an ending state after refresh", () => {
    const sourceEngine = startAtChoices();
    sourceEngine.selectChoice("B");
    sourceEngine.completeVideo();
    const restoredEngine = new StoryEngine(localTestStory);

    expect(restoredEngine.restore(sourceEngine.getSnapshot())).toMatchObject({
      phase: "ended",
      currentNodeId: "Ending003",
      history: ["Node001", "Node003", "Ending003"],
    });
  });

  it("restores a consecutive branch video before it reaches its ending", () => {
    const sourceEngine = startAtChoices();
    sourceEngine.selectChoice("C");
    const restoredEngine = new StoryEngine(localTestStory);

    expect(restoredEngine.restore(sourceEngine.getSnapshot())).toMatchObject({
      phase: "playing",
      currentNodeId: "Node004",
      history: ["Node001", "Node004"],
    });
  });

  it("rejects a snapshot containing an illegal node", () => {
    const engine = new StoryEngine(localTestStory);
    const error = captureStoryError(() =>
      engine.restore({
        version: 1,
        storyId: localTestStory.id,
        phase: "ended",
        currentNodeId: "Node999",
        history: ["Node001", "Node999"],
      }),
    );

    expect(error).toMatchObject({
      code: "NODE_NOT_FOUND",
      nodeId: "Node999",
    });
    expect(engine.getState().phase).toBe("idle");
  });
});
