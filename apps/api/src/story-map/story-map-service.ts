import type {
  AccountStoryMapResponse,
  StoryMapNodeState,
} from "@interactive-story/api-contracts";

import type {
  StoredChoiceFact,
  StoredNodePrerequisite,
  StoredPrerequisitePurpose,
  StoredPrerequisiteSourceScope,
  StoredStoryMapContext,
  StoredStoryMapNode,
  StoryMapRepository,
} from "./story-map-repository.js";

export type StoryMapErrorCode =
  | "CHAPTER_PROGRESS_NOT_FOUND"
  | "STORY_MAP_NOT_CONFIGURED";

const errorMessages: Record<StoryMapErrorCode, string> = {
  CHAPTER_PROGRESS_NOT_FOUND: "当前账号尚未开始该章节。",
  STORY_MAP_NOT_CONFIGURED: "当前章节尚未配置剧情地图。",
};

export class StoryMapError extends Error {
  constructor(
    public readonly code: StoryMapErrorCode,
    public readonly statusCode: 404,
  ) {
    super(errorMessages[code]);
    this.name = "StoryMapError";
  }
}

export interface StoryMapUseCase {
  getMap(userId: string, chapterCode: string): Promise<AccountStoryMapResponse>;
}

interface StoryFacts {
  mainlineDiscovered: Set<string>;
  mainlineAvailable: Set<string>;
  mainlineCompleted: Set<string>;
  mainlineChoices: Set<string>;
  explorationDiscovered: Set<string>;
  explorationCompleted: Set<string>;
  explorationChoices: Set<string>;
}

export class StoryMapService implements StoryMapUseCase {
  constructor(private readonly repository: StoryMapRepository) {}

  async getMap(userId: string, chapterCode: string) {
    const context = await this.repository.findByUserAndChapter(userId, chapterCode);
    if (!context) {
      throw new StoryMapError("CHAPTER_PROGRESS_NOT_FOUND", 404);
    }
    if (context.regions.length === 0) {
      throw new StoryMapError("STORY_MAP_NOT_CONFIGURED", 404);
    }

    return projectMap(context);
  }
}

function projectMap(context: StoredStoryMapContext): AccountStoryMapResponse {
  const facts = collectFacts(context);
  const allNodes = context.regions.flatMap((region) => region.nodes);
  const discovered = new Set([
    ...facts.mainlineDiscovered,
    ...facts.explorationDiscovered,
  ]);

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of allNodes) {
      if (
        !discovered.has(node.nodeCode) &&
        satisfiesPurpose(node, "DISCOVERY", facts, discovered)
      ) {
        discovered.add(node.nodeCode);
        changed = true;
      }
    }
  }

  const completed = new Set([
    ...facts.mainlineCompleted,
    ...facts.explorationCompleted,
  ]);

  const regions = context.regions.flatMap((region) => {
    const nodes = region.nodes.flatMap((node) => {
      if (!discovered.has(node.nodeCode)) return [];

      const state = resolveState(node, facts, discovered, completed);
      return [
        {
          nodeCode: node.nodeCode,
          title: node.displayTitle,
          description: node.description,
          coverUrl: node.coverUrl,
          position: { x: node.positionX, y: node.positionY },
          sortOrder: node.sortOrder,
          state,
          actions: {
            canExplore:
              (state === "available" || state === "completed") &&
              node.allowExploration,
            canReplay: state === "completed" && node.allowReplay,
          },
        },
      ];
    });

    return nodes.length > 0
      ? [
          {
            code: region.code,
            title: region.title,
            description: region.description,
            sortOrder: region.sortOrder,
            layoutMetadata: region.layoutMetadata,
            nodes,
          },
        ]
      : [];
  });

  return {
    release: context.release,
    progress: {
      status:
        context.progress.status === "COMPLETED" ? "completed" : "in_progress",
      currentNodeCode: context.progress.currentNodeCode,
    },
    regions,
  };
}

function collectFacts(context: StoredStoryMapContext): StoryFacts {
  const explorationRuns = context.explorationRuns.filter(
    (run) => run.mode === "EXPLORATION",
  );

  return {
    mainlineDiscovered: new Set(
      context.mainlineNodes.map((node) => node.nodeCode),
    ),
    mainlineAvailable: new Set(
      context.mainlineNodes
        .filter((node) => node.available)
        .map((node) => node.nodeCode),
    ),
    mainlineCompleted: new Set(
      context.mainlineNodes
        .filter((node) => node.completed)
        .map((node) => node.nodeCode),
    ),
    mainlineChoices: choiceSet(context.mainlineChoices),
    explorationDiscovered: new Set(
      explorationRuns.flatMap((run) => run.nodes.map((node) => node.nodeCode)),
    ),
    explorationCompleted: new Set(
      explorationRuns.flatMap((run) =>
        run.nodes
          .filter((node) => node.completed)
          .map((node) => node.nodeCode),
      ),
    ),
    explorationChoices: choiceSet(
      explorationRuns.flatMap((run) => run.choices),
    ),
  };
}

function resolveState(
  node: StoredStoryMapNode,
  facts: StoryFacts,
  discovered: Set<string>,
  completed: Set<string>,
): StoryMapNodeState {
  if (completed.has(node.nodeCode)) return "completed";

  const previouslyAvailable =
    facts.mainlineAvailable.has(node.nodeCode) ||
    facts.explorationDiscovered.has(node.nodeCode);
  return previouslyAvailable ||
    satisfiesPurpose(node, "UNLOCK", facts, discovered)
    ? "available"
    : "discovered_locked";
}

function satisfiesPurpose(
  node: StoredStoryMapNode,
  purpose: StoredPrerequisitePurpose,
  facts: StoryFacts,
  discovered: Set<string>,
) {
  const prerequisites = node.prerequisites.filter(
    (prerequisite) => prerequisite.purpose === purpose,
  );
  if (prerequisites.length === 0) {
    return purpose === "UNLOCK";
  }

  const groups = new Map<string, StoredNodePrerequisite[]>();
  for (const prerequisite of prerequisites) {
    const group = groups.get(prerequisite.groupCode) ?? [];
    group.push(prerequisite);
    groups.set(prerequisite.groupCode, group);
  }

  return [...groups.values()].some((group) =>
    group.every((prerequisite) => hasFact(prerequisite, facts, discovered)),
  );
}

function hasFact(
  prerequisite: StoredNodePrerequisite,
  facts: StoryFacts,
  discovered: Set<string>,
) {
  if (prerequisite.factType === "CHAPTER_STARTED") return true;

  const nodeCode = prerequisite.requiredNodeCode;
  if (!nodeCode) return false;

  if (prerequisite.factType === "NODE_DISCOVERED") {
    return factByScope(
      prerequisite.sourceScope,
      facts.mainlineDiscovered.has(nodeCode),
      facts.explorationDiscovered.has(nodeCode),
      discovered.has(nodeCode),
    );
  }

  if (prerequisite.factType === "NODE_COMPLETED") {
    return factByScope(
      prerequisite.sourceScope,
      facts.mainlineCompleted.has(nodeCode),
      facts.explorationCompleted.has(nodeCode),
    );
  }

  const choiceCode = prerequisite.requiredChoiceCode;
  if (!choiceCode) return false;
  const key = choiceKey(nodeCode, choiceCode);
  return factByScope(
    prerequisite.sourceScope,
    facts.mainlineChoices.has(key),
    facts.explorationChoices.has(key),
  );
}

function factByScope(
  scope: StoredPrerequisiteSourceScope,
  mainline: boolean,
  exploration: boolean,
  any = mainline || exploration,
) {
  if (scope === "MAINLINE_ONLY") return mainline;
  if (scope === "EXPLORATION_ONLY") return exploration;
  return any;
}

function choiceSet(choices: StoredChoiceFact[]) {
  return new Set(
    choices.map((choice) =>
      choiceKey(choice.sourceNodeCode, choice.choiceCode),
    ),
  );
}

function choiceKey(sourceNodeCode: string, choiceCode: string) {
  return `${sourceNodeCode}\u0000${choiceCode}`;
}
