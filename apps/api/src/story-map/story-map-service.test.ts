import { describe, expect, it } from "vitest";

import type {
  StoredNodePrerequisite,
  StoredStoryMapContext,
  StoredStoryMapNode,
  StoryMapRepository,
} from "./story-map-repository.js";
import { StoryMapError, StoryMapService } from "./story-map-service.js";

function prerequisite(
  input: Partial<StoredNodePrerequisite> &
    Pick<StoredNodePrerequisite, "purpose" | "factType">,
): StoredNodePrerequisite {
  return {
    groupCode: "default",
    requiredNodeCode: null,
    requiredChoiceCode: null,
    sourceScope: "ANY",
    sortOrder: 0,
    ...input,
  };
}

function mapNode(
  nodeCode: string,
  prerequisites: StoredNodePrerequisite[] = [],
): StoredStoryMapNode {
  return {
    nodeCode,
    displayTitle: nodeCode,
    description: null,
    coverUrl: null,
    positionX: 0,
    positionY: 0,
    sortOrder: Number(nodeCode.slice(-1)) || 0,
    allowExploration: true,
    allowReplay: true,
    prerequisites,
  };
}

function createContext(
  overrides: Partial<StoredStoryMapContext> = {},
): StoredStoryMapContext {
  const node001Completed = prerequisite({
    purpose: "DISCOVERY",
    factType: "NODE_COMPLETED",
    requiredNodeCode: "Node001",
  });

  return {
    release: { id: "release-1", version: 1 },
    progress: { status: "IN_PROGRESS", currentNodeCode: "Node001" },
    regions: [
      {
        code: "opening",
        title: "开场",
        description: null,
        sortOrder: 0,
        layoutMetadata: null,
        nodes: [
          mapNode("Node001"),
          mapNode("Node002", [
            node001Completed,
            prerequisite({
              purpose: "UNLOCK",
              factType: "CHOICE_SELECTED",
              requiredNodeCode: "Node001",
              requiredChoiceCode: "A",
              sourceScope: "MAINLINE_ONLY",
            }),
          ]),
          mapNode("Node003", [
            node001Completed,
            prerequisite({
              purpose: "UNLOCK",
              factType: "CHOICE_SELECTED",
              requiredNodeCode: "Node001",
              requiredChoiceCode: "B",
            }),
          ]),
          mapNode("Node004", [
            prerequisite({
              purpose: "DISCOVERY",
              factType: "CHOICE_SELECTED",
              requiredNodeCode: "Node001",
              requiredChoiceCode: "C",
            }),
          ]),
        ],
      },
    ],
    mainlineNodes: [
      { nodeCode: "Node001", available: true, completed: true },
    ],
    mainlineChoices: [],
    explorationRuns: [],
    ...overrides,
  };
}

function createService(context: StoredStoryMapContext | null) {
  const repository: StoryMapRepository = {
    async findByUserAndChapter() {
      return context;
    },
  };
  return new StoryMapService(repository);
}

function states(response: Awaited<ReturnType<StoryMapService["getMap"]>>) {
  return Object.fromEntries(
    response.regions.flatMap((region) =>
      region.nodes.map((node) => [node.nodeCode, node.state]),
    ),
  );
}

describe("story map service", () => {
  it("rejects an authenticated user who has not started the chapter", async () => {
    await expect(
      createService(null).getMap("user-1", "chapter-01"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<StoryMapError>>({
        code: "CHAPTER_PROGRESS_NOT_FOUND",
        statusCode: 404,
      }),
    );
  });

  it("returns completed, locked and hidden states after Node001 completes", async () => {
    const response = await createService(createContext()).getMap(
      "user-1",
      "chapter-01",
    );

    expect(states(response)).toEqual({
      Node001: "completed",
      Node002: "discovered_locked",
      Node003: "discovered_locked",
    });
    expect(
      response.regions[0]?.nodes.some((node) => node.nodeCode === "Node004"),
    ).toBe(false);
  });

  it("makes the A route available from a mainline Choice fact", async () => {
    const response = await createService(
      createContext({
        mainlineChoices: [{ sourceNodeCode: "Node001", choiceCode: "A" }],
      }),
    ).getMap("user-1", "chapter-01");

    expect(states(response)).toMatchObject({
      Node002: "available",
      Node003: "discovered_locked",
    });
    const node002 = response.regions[0]?.nodes.find(
      (node) => node.nodeCode === "Node002",
    );
    expect(node002?.actions).toEqual({ canExplore: true, canReplay: false });
  });

  it("uses B route facts from exploration and marks its completed node", async () => {
    const response = await createService(
      createContext({
        explorationRuns: [
          {
            mode: "EXPLORATION",
            nodes: [
              { nodeCode: "Node001", completed: true },
              { nodeCode: "Node003", completed: true },
            ],
            choices: [{ sourceNodeCode: "Node001", choiceCode: "B" }],
          },
        ],
      }),
    ).getMap("user-1", "chapter-01");

    expect(states(response)).toMatchObject({ Node003: "completed" });
    const node003 = response.regions[0]?.nodes.find(
      (node) => node.nodeCode === "Node003",
    );
    expect(node003?.actions).toEqual({ canExplore: true, canReplay: true });
  });

  it("does not use Replay nodes or Choices as discovery, unlock or completion facts", async () => {
    const response = await createService(
      createContext({
        explorationRuns: [
          {
            mode: "REPLAY",
            nodes: [
              { nodeCode: "Node003", completed: true },
              { nodeCode: "Node004", completed: true },
            ],
            choices: [
              { sourceNodeCode: "Node001", choiceCode: "B" },
              { sourceNodeCode: "Node001", choiceCode: "C" },
            ],
          },
        ],
      }),
    ).getMap("user-1", "chapter-01");

    expect(states(response)).toMatchObject({
      Node003: "discovered_locked",
    });
    expect(states(response)).not.toHaveProperty("Node004");
  });
});
