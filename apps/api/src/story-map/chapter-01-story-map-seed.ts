import {
  ChapterReleaseStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

const chapterCode = "chapter-01";
const requiredNodeCodes = ["Node001", "Node002", "Node003", "Node004"] as const;

const chapter01Map = {
  code: "chapter-01-opening",
  title: "初遇",
  description: "第一章已经发现的剧情区域。",
  sortOrder: 0,
  nodes: [
    {
      nodeCode: "Node001",
      displayTitle: "相遇",
      description: "故事开始的地方。",
      coverUrl: null,
      positionX: 100,
      positionY: 300,
      sortOrder: 0,
      allowExploration: false,
      allowReplay: true,
      prerequisiteFactType: "CHAPTER_STARTED" as const,
      requiredNodeCode: null,
      groupCode: "chapter-started",
    },
    {
      nodeCode: "Node002",
      displayTitle: "图书馆",
      description: "接受邀请后前往图书馆。",
      coverUrl: null,
      positionX: 700,
      positionY: 100,
      sortOrder: 1,
      allowExploration: true,
      allowReplay: true,
      prerequisiteFactType: "NODE_COMPLETED" as const,
      requiredNodeCode: "Node001",
      groupCode: "entry-completed",
    },
    {
      nodeCode: "Node003",
      displayTitle: "泳池",
      description: "接受邀请后一起去游泳。",
      coverUrl: null,
      positionX: 700,
      positionY: 300,
      sortOrder: 2,
      allowExploration: true,
      allowReplay: true,
      prerequisiteFactType: "NODE_COMPLETED" as const,
      requiredNodeCode: "Node001",
      groupCode: "entry-completed",
    },
    {
      nodeCode: "Node004",
      displayTitle: "水上乐园",
      description: "接受邀请后前往水上乐园。",
      coverUrl: null,
      positionX: 700,
      positionY: 500,
      sortOrder: 3,
      allowExploration: true,
      allowReplay: true,
      prerequisiteFactType: "NODE_COMPLETED" as const,
      requiredNodeCode: "Node001",
      groupCode: "entry-completed",
    },
  ],
} as const;

const releaseMapInclude = {
  storyMapRegions: {
    orderBy: { sortOrder: "asc" },
    include: {
      nodes: {
        orderBy: { sortOrder: "asc" },
        include: {
          prerequisites: {
            orderBy: [
              { purpose: "asc" },
              { groupCode: "asc" },
              { sortOrder: "asc" },
            ],
          },
        },
      },
    },
  },
} satisfies Prisma.ChapterReleaseInclude;

type ReleaseWithMap = Prisma.ChapterReleaseGetPayload<{
  include: typeof releaseMapInclude;
}>;

export interface Chapter01StoryMapSeedResult {
  chapterCode: string;
  releaseId: string;
  releaseVersion: number;
  created: boolean;
  regionCount: number;
  nodeCount: number;
  prerequisiteCount: number;
}

export class Chapter01StoryMapSeeder {
  constructor(private readonly prisma: PrismaClient) {}

  async seed(): Promise<Chapter01StoryMapSeedResult> {
    return this.prisma.$transaction(async (transaction) => {
      const release = await transaction.chapterRelease.findFirst({
        where: {
          status: ChapterReleaseStatus.ACTIVE,
          chapter: { code: chapterCode },
        },
        include: releaseMapInclude,
        orderBy: { version: "desc" },
      });

      if (!release) {
        throw new Error(
          `未找到 ${chapterCode} 的 ACTIVE ChapterRelease，请先发布章节。`,
        );
      }
      validateReleaseSnapshot(release.snapshot);

      if (release.storyMapRegions.length > 0) {
        assertExistingMapMatches(release);
        return seedResult(release, false, release.storyMapRegions.length);
      }

      await transaction.storyMapRegion.create({
        data: {
          chapterReleaseId: release.id,
          code: chapter01Map.code,
          title: chapter01Map.title,
          description: chapter01Map.description,
          sortOrder: chapter01Map.sortOrder,
          nodes: {
            create: chapter01Map.nodes.map((node) => ({
              nodeCode: node.nodeCode,
              displayTitle: node.displayTitle,
              description: node.description,
              coverUrl: node.coverUrl,
              positionX: node.positionX,
              positionY: node.positionY,
              sortOrder: node.sortOrder,
              allowExploration: node.allowExploration,
              allowReplay: node.allowReplay,
              prerequisites: {
                create: (["DISCOVERY", "UNLOCK"] as const).map(
                  (purpose) => ({
                    purpose,
                    groupCode: node.groupCode,
                    factType: node.prerequisiteFactType,
                    requiredNodeCode: node.requiredNodeCode,
                    requiredChoiceCode: null,
                    sourceScope: "MAINLINE_ONLY" as const,
                    sortOrder: 0,
                  }),
                ),
              },
            })),
          },
        },
      });

      return seedResult(release, true, 1);
    });
  }
}

function validateReleaseSnapshot(snapshot: unknown) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    !("chapter" in snapshot) ||
    !snapshot.chapter ||
    typeof snapshot.chapter !== "object" ||
    !("code" in snapshot.chapter) ||
    snapshot.chapter.code !== chapterCode ||
    !("nodes" in snapshot.chapter) ||
    !Array.isArray(snapshot.chapter.nodes)
  ) {
    throw new Error(`${chapterCode} 的 ChapterRelease snapshot 结构无效。`);
  }

  const nodeCodes = new Set(
    snapshot.chapter.nodes.flatMap((node) =>
      node &&
      typeof node === "object" &&
      "id" in node &&
      typeof node.id === "string"
        ? [node.id]
        : [],
    ),
  );
  const missing = requiredNodeCodes.filter((nodeCode) => !nodeCodes.has(nodeCode));
  if (missing.length > 0) {
    throw new Error(
      `${chapterCode} 的发布快照缺少地图节点：${missing.join(", ")}。`,
    );
  }
}

function assertExistingMapMatches(release: ReleaseWithMap) {
  const normalized = release.storyMapRegions.map((region) => ({
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
  }));

  if (JSON.stringify(normalized) !== JSON.stringify(expectedConfiguration())) {
    throw new Error(
      `${chapterCode} 的 ACTIVE ChapterRelease 已存在不同的地图配置，Seed 已停止，未覆盖数据。`,
    );
  }
}

function expectedConfiguration() {
  return [
    {
      code: chapter01Map.code,
      title: chapter01Map.title,
      description: chapter01Map.description,
      sortOrder: chapter01Map.sortOrder,
      layoutMetadata: null,
      nodes: chapter01Map.nodes.map((node) => ({
        nodeCode: node.nodeCode,
        displayTitle: node.displayTitle,
        description: node.description,
        coverUrl: node.coverUrl,
        positionX: node.positionX,
        positionY: node.positionY,
        sortOrder: node.sortOrder,
        allowExploration: node.allowExploration,
        allowReplay: node.allowReplay,
        prerequisites: (["DISCOVERY", "UNLOCK"] as const).map((purpose) => ({
          purpose,
          groupCode: node.groupCode,
          factType: node.prerequisiteFactType,
          requiredNodeCode: node.requiredNodeCode,
          requiredChoiceCode: null,
          sourceScope: "MAINLINE_ONLY",
          sortOrder: 0,
        })),
      })),
    },
  ];
}

function seedResult(
  release: Pick<ReleaseWithMap, "id" | "version">,
  created: boolean,
  regionCount: number,
): Chapter01StoryMapSeedResult {
  return {
    chapterCode,
    releaseId: release.id,
    releaseVersion: release.version,
    created,
    regionCount,
    nodeCount: chapter01Map.nodes.length,
    prerequisiteCount: chapter01Map.nodes.length * 2,
  };
}
