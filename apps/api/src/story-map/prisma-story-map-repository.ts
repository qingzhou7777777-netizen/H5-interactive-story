import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  StoredStoryMapContext,
  StoryMapRepository,
} from "./story-map-repository.js";

const storyMapContextSelect = {
  status: true,
  currentNodeCode: true,
  chapterRelease: {
    select: {
      id: true,
      version: true,
      storyMapRegions: {
        orderBy: { sortOrder: "asc" },
        select: {
          code: true,
          title: true,
          description: true,
          sortOrder: true,
          layoutMetadata: true,
          nodes: {
            orderBy: { sortOrder: "asc" },
            select: {
              nodeCode: true,
              displayTitle: true,
              description: true,
              coverUrl: true,
              positionX: true,
              positionY: true,
              sortOrder: true,
              allowExploration: true,
              allowReplay: true,
              prerequisites: {
                orderBy: [
                  { purpose: "asc" },
                  { groupCode: "asc" },
                  { sortOrder: "asc" },
                ],
                select: {
                  purpose: true,
                  groupCode: true,
                  factType: true,
                  requiredNodeCode: true,
                  requiredChoiceCode: true,
                  sourceScope: true,
                  sortOrder: true,
                },
              },
            },
          },
        },
      },
    },
  },
  nodeProgresses: {
    select: {
      nodeCode: true,
      availableAt: true,
      firstCompletedAt: true,
      completionCount: true,
    },
  },
  choiceDecisions: {
    select: {
      sourceNodeCode: true,
      choiceCode: true,
    },
  },
  explorationRuns: {
    select: {
      mode: true,
      nodePlaySessions: {
        select: {
          nodeCode: true,
          completedAt: true,
          choiceDecision: {
            select: {
              sourceNodeCode: true,
              choiceCode: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserChapterProgressSelect;

type StoryMapContextRecord = Prisma.UserChapterProgressGetPayload<{
  select: typeof storyMapContextSelect;
}>;

export class PrismaStoryMapRepository implements StoryMapRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserAndChapter(userId: string, chapterCode: string) {
    const progress = await this.prisma.userChapterProgress.findFirst({
      where: {
        userId,
        chapterRelease: { chapter: { code: chapterCode } },
      },
      select: storyMapContextSelect,
      orderBy: { createdAt: "desc" },
    });

    return progress ? mapContext(progress) : null;
  }
}

function mapContext(progress: StoryMapContextRecord): StoredStoryMapContext {
  return {
    release: {
      id: progress.chapterRelease.id,
      version: progress.chapterRelease.version,
    },
    progress: {
      status: progress.status,
      currentNodeCode: progress.currentNodeCode,
    },
    regions: progress.chapterRelease.storyMapRegions.map((region) => ({
      code: region.code,
      title: region.title,
      description: region.description,
      sortOrder: region.sortOrder,
      layoutMetadata: region.layoutMetadata,
      nodes: region.nodes.map((node) => ({
        nodeCode: node.nodeCode,
        displayTitle: node.displayTitle,
        description: node.description,
        coverUrl: node.coverUrl,
        positionX: node.positionX,
        positionY: node.positionY,
        sortOrder: node.sortOrder,
        allowExploration: node.allowExploration,
        allowReplay: node.allowReplay,
        prerequisites: node.prerequisites.map((prerequisite) => ({
          purpose: prerequisite.purpose,
          groupCode: prerequisite.groupCode,
          factType: prerequisite.factType,
          requiredNodeCode: prerequisite.requiredNodeCode,
          requiredChoiceCode: prerequisite.requiredChoiceCode,
          sourceScope: prerequisite.sourceScope,
          sortOrder: prerequisite.sortOrder,
        })),
      })),
    })),
    mainlineNodes: progress.nodeProgresses.map((node) => ({
      nodeCode: node.nodeCode,
      available: node.availableAt !== null,
      completed: node.firstCompletedAt !== null || node.completionCount > 0,
    })),
    mainlineChoices: progress.choiceDecisions.map((choice) => ({
      sourceNodeCode: choice.sourceNodeCode,
      choiceCode: choice.choiceCode,
    })),
    explorationRuns: progress.explorationRuns.map((run) => ({
      mode: run.mode,
      nodes: run.nodePlaySessions.map((session) => ({
        nodeCode: session.nodeCode,
        completed: session.completedAt !== null,
      })),
      choices: run.nodePlaySessions.flatMap((session) =>
        session.choiceDecision
          ? [
              {
                sourceNodeCode: session.choiceDecision.sourceNodeCode,
                choiceCode: session.choiceDecision.choiceCode,
              },
            ]
          : [],
      ),
    })),
  };
}
