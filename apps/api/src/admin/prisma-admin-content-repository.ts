import {
  CompletionMode,
  ContentStatus,
  Prisma,
  PrismaClient,
  StoryNodeType,
  VideoStatus,
} from "@prisma/client";

import type {
  AdminChapterDetailDto,
  AdminChapterSummaryDto,
  AdminContentStatusDto,
  AdminNodeDto,
  AdminVideoAssetDto,
  AdminVideoStatusDto,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

import {
  AdminContentValidationError,
  type AdminContentRepository,
} from "./admin-content-repository.js";

const videoAssetInclude = Prisma.validator<Prisma.VideoAssetInclude>()({
  nodes: {
    orderBy: { code: "asc" },
    include: { chapter: true },
  },
});

const chapterSummaryInclude = Prisma.validator<Prisma.ChapterInclude>()({
  story: true,
  character: true,
  entryNode: true,
  _count: { select: { nodes: true } },
});

const chapterDetailInclude = Prisma.validator<Prisma.ChapterInclude>()({
  story: true,
  character: true,
  entryNode: true,
  nodes: {
    orderBy: { code: "asc" },
    include: {
      videoAsset: true,
      nextNode: true,
      outgoingChoices: {
        orderBy: { sortOrder: "asc" },
        include: { targetNode: true },
      },
    },
  },
});

type VideoAssetRecord = Prisma.VideoAssetGetPayload<{
  include: typeof videoAssetInclude;
}>;
type ChapterSummaryRecord = Prisma.ChapterGetPayload<{
  include: typeof chapterSummaryInclude;
}>;
type ChapterDetailRecord = Prisma.ChapterGetPayload<{
  include: typeof chapterDetailInclude;
}>;

const contentStatusToPrisma = {
  draft: ContentStatus.DRAFT,
  active: ContentStatus.ACTIVE,
  disabled: ContentStatus.DISABLED,
} satisfies Record<AdminContentStatusDto, ContentStatus>;

const videoStatusToPrisma = {
  uploading: VideoStatus.UPLOADING,
  processing: VideoStatus.PROCESSING,
  ready: VideoStatus.READY,
  failed: VideoStatus.FAILED,
  disabled: VideoStatus.DISABLED,
} satisfies Record<AdminVideoStatusDto, VideoStatus>;

function mapContentStatus(status: ContentStatus): AdminContentStatusDto {
  return status.toLowerCase() as AdminContentStatusDto;
}

function mapVideoStatus(status: VideoStatus): AdminVideoStatusDto {
  return status.toLowerCase() as AdminVideoStatusDto;
}

function mapVideoAsset(asset: VideoAssetRecord): AdminVideoAssetDto {
  return {
    id: asset.id,
    code: asset.code,
    originalFilename: asset.originalFilename,
    objectKey: asset.objectKey,
    playbackUrl: asset.playbackPath,
    posterUrl: asset.posterPath,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize?.toString() ?? null,
    durationMs: asset.durationMs,
    width: asset.width,
    height: asset.height,
    checksum: asset.checksum,
    videoCodec: asset.videoCodec,
    audioCodec: asset.audioCodec,
    pixelFormat: asset.pixelFormat,
    frameRate: asset.frameRate,
    processingError: asset.processingError,
    posterObjectKey: asset.posterObjectKey,
    posterMimeType: asset.posterMimeType,
    posterFileSize: asset.posterFileSize?.toString() ?? null,
    status: mapVideoStatus(asset.status),
    relatedNodes: asset.nodes.map((node) => ({
      chapterCode: node.chapter.code,
      nodeId: node.code,
      nodeTitle: node.title,
    })),
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
  };
}

function mapChapterSummary(chapter: ChapterSummaryRecord): AdminChapterSummaryDto {
  return {
    id: chapter.id,
    code: chapter.code,
    title: chapter.title,
    description: chapter.description,
    status: mapContentStatus(chapter.status),
    entryNodeId: chapter.entryNode?.code ?? null,
    nodeCount: chapter._count.nodes,
    story: {
      code: chapter.story.code,
      title: chapter.story.title,
      status: mapContentStatus(chapter.story.status),
    },
    character: {
      code: chapter.character.code,
      name: chapter.character.name,
      status: mapContentStatus(chapter.character.status),
    },
    createdAt: chapter.createdAt.toISOString(),
    updatedAt: chapter.updatedAt.toISOString(),
  };
}

function mapAdminNode(node: ChapterDetailRecord["nodes"][number]): AdminNodeDto {
  return {
    id: node.code,
    title: node.title,
    message: node.message,
    type: node.nodeType.toLowerCase() as AdminNodeDto["type"],
    completionMode: node.completionMode.toLowerCase() as AdminNodeDto["completionMode"],
    status: mapContentStatus(node.status),
    accessMode: node.accessMode.toLowerCase() as AdminNodeDto["accessMode"],
    videoAssetId: node.videoAsset?.code ?? null,
    videoAssetStatus: node.videoAsset ? mapVideoStatus(node.videoAsset.status) : null,
    nextNodeId: node.nextNode?.code ?? null,
    choices: node.outgoingChoices.map((choice) => ({
      id: choice.code,
      label: choice.label,
      sourceNodeId: node.code,
      targetNodeId: choice.targetNode.code,
      sortOrder: choice.sortOrder,
      enabled: choice.enabled,
    })),
  };
}

function mapChapterDetail(chapter: ChapterDetailRecord): AdminChapterDetailDto {
  return {
    id: chapter.id,
    code: chapter.code,
    title: chapter.title,
    description: chapter.description,
    status: mapContentStatus(chapter.status),
    entryNodeId: chapter.entryNode?.code ?? null,
    nodeCount: chapter.nodes.length,
    story: {
      code: chapter.story.code,
      title: chapter.story.title,
      status: mapContentStatus(chapter.story.status),
    },
    character: {
      code: chapter.character.code,
      name: chapter.character.name,
      status: mapContentStatus(chapter.character.status),
    },
    createdAt: chapter.createdAt.toISOString(),
    updatedAt: chapter.updatedAt.toISOString(),
    nodes: chapter.nodes.map(mapAdminNode),
  };
}

function validateChapterForActivation(chapter: ChapterDetailRecord) {
  const issues: string[] = [];

  if (chapter.story.status !== ContentStatus.ACTIVE) {
    issues.push("所属 Story 不是 ACTIVE。");
  }
  if (chapter.character.status !== ContentStatus.ACTIVE) {
    issues.push("所属 Character 不是 ACTIVE。");
  }
  if (!chapter.entryNode || chapter.entryNode.chapterId !== chapter.id) {
    issues.push("章节没有有效的入口节点。");
  } else if (chapter.entryNode.status !== ContentStatus.ACTIVE) {
    issues.push(`入口节点 ${chapter.entryNode.code} 不是 ACTIVE。`);
  }

  const activeNodes = chapter.nodes.filter((node) => node.status === ContentStatus.ACTIVE);
  if (activeNodes.length === 0) {
    issues.push("章节没有 ACTIVE 节点。");
  }

  for (const node of activeNodes) {
    const enabledChoices = node.outgoingChoices.filter((choice) => choice.enabled);

    if (node.nodeType === StoryNodeType.VIDEO) {
      if (
        !node.videoAsset ||
        node.videoAsset.status !== VideoStatus.READY ||
        !node.videoAsset.playbackPath?.trim()
      ) {
        issues.push(`视频节点 ${node.code} 缺少 READY 且具有播放 URL 的视频资源。`);
      }
    }

    if (
      (node.nodeType === StoryNodeType.CHOICE ||
        node.completionMode === CompletionMode.CHOICES) &&
      enabledChoices.length === 0
    ) {
      issues.push(`节点 ${node.code} 需要至少一个启用选项。`);
    }

    if (node.completionMode === CompletionMode.NEXT) {
      if (
        !node.nextNode ||
        node.nextNode.chapterId !== chapter.id ||
        node.nextNode.status !== ContentStatus.ACTIVE
      ) {
        issues.push(`节点 ${node.code} 的下一节点无效或不是 ACTIVE。`);
      }
    }

    if (node.nodeType === StoryNodeType.ENDING) {
      if (node.completionMode !== CompletionMode.END) {
        issues.push(`结局节点 ${node.code} 的完成模式必须是 END。`);
      }
      if (node.nextNode || enabledChoices.length > 0) {
        issues.push(`结局节点 ${node.code} 不能继续跳转。`);
      }
    }

    for (const choice of enabledChoices) {
      if (
        choice.targetNode.chapterId !== chapter.id ||
        choice.targetNode.status !== ContentStatus.ACTIVE
      ) {
        issues.push(`选项 ${node.code}.${choice.code} 的目标节点无效或不是 ACTIVE。`);
      }
    }
  }

  if (issues.length > 0) {
    throw new AdminContentValidationError(
      "CHAPTER_NOT_PUBLISHABLE",
      `章节无法发布：${issues.join(" ")}`,
    );
  }
}

export class PrismaAdminContentRepository implements AdminContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listVideoAssets(): Promise<AdminVideoAssetDto[]> {
    const assets = await this.prisma.videoAsset.findMany({
      orderBy: { code: "asc" },
      include: videoAssetInclude,
    });
    return assets.map(mapVideoAsset);
  }

  async getVideoAsset(assetCode: string): Promise<AdminVideoAssetDto | null> {
    const asset = await this.prisma.videoAsset.findUnique({
      where: { code: assetCode },
      include: videoAssetInclude,
    });
    return asset ? mapVideoAsset(asset) : null;
  }

  async updateVideoAsset(
    assetCode: string,
    input: UpdateAdminVideoAssetRequest,
  ): Promise<AdminVideoAssetDto | null> {
    const existing = await this.prisma.videoAsset.findUnique({
      where: { code: assetCode },
    });
    if (!existing) {
      return null;
    }

    const nextPlaybackUrl =
      "playbackUrl" in input ? input.playbackUrl : existing.playbackPath;
    const nextStatus =
      input.status === undefined ? existing.status : videoStatusToPrisma[input.status];

    if (nextStatus === VideoStatus.READY && !nextPlaybackUrl?.trim()) {
      throw new AdminContentValidationError(
        "READY_VIDEO_REQUIRES_URL",
        "READY 视频资源必须配置 video URL。",
      );
    }

    const data: Prisma.VideoAssetUpdateInput = {};
    if ("playbackUrl" in input) {
      data.playbackPath = input.playbackUrl;
    }
    if ("posterUrl" in input) {
      data.posterPath = input.posterUrl;
    }
    if (input.status !== undefined) {
      data.status = videoStatusToPrisma[input.status];
    }

    const updated = await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data,
      include: videoAssetInclude,
    });
    return mapVideoAsset(updated);
  }

  async listChapters(): Promise<AdminChapterSummaryDto[]> {
    const chapters = await this.prisma.chapter.findMany({
      orderBy: { code: "asc" },
      include: chapterSummaryInclude,
    });
    return chapters.map(mapChapterSummary);
  }

  async getChapter(chapterCode: string): Promise<AdminChapterDetailDto | null> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { code: chapterCode },
      include: chapterDetailInclude,
    });
    return chapter ? mapChapterDetail(chapter) : null;
  }

  async updateChapterStatus(
    chapterCode: string,
    status: AdminContentStatusDto,
  ): Promise<AdminChapterDetailDto | null> {
    const chapter = await this.prisma.chapter.findUnique({
      where: { code: chapterCode },
      include: chapterDetailInclude,
    });
    if (!chapter) {
      return null;
    }

    if (status === "active") {
      validateChapterForActivation(chapter);
    }

    await this.prisma.chapter.update({
      where: { code: chapterCode },
      data: { status: contentStatusToPrisma[status] },
    });
    return this.getChapter(chapterCode);
  }
}
