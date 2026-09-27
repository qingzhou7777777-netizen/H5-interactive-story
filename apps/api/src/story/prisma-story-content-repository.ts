import {
  ContentStatus,
  PrismaClient,
  VideoStatus,
  type AccessMode,
  type CompletionMode,
  type StoryNodeType,
} from "@prisma/client";

import type {
  AccessModeDto,
  ChapterDto,
  CompletionModeDto,
  NodeDto,
  StoryNodeTypeDto,
  SubmitChoiceResponse,
  VideoAssetDto,
} from "@interactive-story/api-contracts";

import type { StoryContentRepository } from "./story-content-repository.js";

function mapNodeType(type: StoryNodeType): StoryNodeTypeDto {
  return type.toLowerCase() as StoryNodeTypeDto;
}

function mapCompletionMode(mode: CompletionMode): CompletionModeDto {
  return mode.toLowerCase() as CompletionModeDto;
}

function mapAccessMode(mode: AccessMode): AccessModeDto {
  return mode.toLowerCase() as AccessModeDto;
}

export class PrismaStoryContentRepository implements StoryContentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getChapter(chapterCode: string): Promise<ChapterDto | null> {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        code: chapterCode,
        status: ContentStatus.ACTIVE,
        story: { status: ContentStatus.ACTIVE },
      },
      include: {
        story: true,
        character: true,
        entryNode: true,
        nodes: {
          where: { status: ContentStatus.ACTIVE },
          orderBy: { code: "asc" },
          include: {
            videoAsset: true,
            nextNode: true,
            outgoingChoices: {
              where: {
                enabled: true,
                targetNode: { status: ContentStatus.ACTIVE },
              },
              orderBy: { sortOrder: "asc" },
              include: { targetNode: true },
            },
          },
        },
      },
    });

    if (!chapter?.entryNode || chapter.entryNode.status !== ContentStatus.ACTIVE) {
      return null;
    }

    const videoAssets = new Map<string, VideoAssetDto>();
    const nodes: NodeDto[] = chapter.nodes.map((node) => {
      const readyVideo =
        node.videoAsset?.status === VideoStatus.READY && node.videoAsset.playbackPath
          ? node.videoAsset
          : null;

      if (readyVideo) {
        videoAssets.set(readyVideo.code, {
          id: readyVideo.code,
          playbackUrl: readyVideo.playbackPath!,
          posterUrl: readyVideo.posterPath,
          mimeType: readyVideo.mimeType,
          durationMs: readyVideo.durationMs,
          width: readyVideo.width,
          height: readyVideo.height,
        });
      }

      return {
        id: node.code,
        title: node.title,
        type: mapNodeType(node.nodeType),
        completionMode: mapCompletionMode(node.completionMode),
        message: node.message,
        videoAssetId: readyVideo?.code ?? null,
        nextNodeId: node.nextNode?.code ?? null,
        accessMode: mapAccessMode(node.accessMode),
        choices: node.outgoingChoices.map((choice) => ({
          id: choice.code,
          label: choice.label,
          targetNodeId: choice.targetNode.code,
          sortOrder: choice.sortOrder,
        })),
      };
    });

    return {
      id: chapter.id,
      code: chapter.code,
      title: chapter.title,
      description: chapter.description,
      entryNodeId: chapter.entryNode.code,
      story: {
        id: chapter.story.id,
        code: chapter.story.code,
        title: chapter.story.title,
        description: chapter.story.description,
      },
      character: {
        code: chapter.character.code,
        name: chapter.character.name,
        avatarUrl: chapter.character.avatarUrl,
        coverUrl: chapter.character.coverUrl,
        description: chapter.character.description,
      },
      nodes,
      videoAssets: [...videoAssets.values()],
    };
  }

  async getNode(chapterCode: string, nodeId: string): Promise<NodeDto | null> {
    const chapter = await this.getChapter(chapterCode);
    return chapter?.nodes.find((node) => node.id === nodeId) ?? null;
  }

  async getVideoAsset(assetId: string): Promise<VideoAssetDto | null> {
    const video = await this.prisma.videoAsset.findFirst({
      where: {
        code: assetId,
        status: VideoStatus.READY,
        playbackPath: { not: null },
      },
    });

    if (!video?.playbackPath) {
      return null;
    }

    return {
      id: video.code,
      playbackUrl: video.playbackPath,
      posterUrl: video.posterPath,
      mimeType: video.mimeType,
      durationMs: video.durationMs,
      width: video.width,
      height: video.height,
    };
  }

  async submitChoice(
    chapterCode: string,
    nodeId: string,
    choiceId: string,
  ): Promise<SubmitChoiceResponse | null> {
    const node = await this.getNode(chapterCode, nodeId);
    const choice = node?.choices.find((candidate) => candidate.id === choiceId);

    return choice
      ? {
          accepted: true,
          sourceNodeId: nodeId,
          choiceId,
          targetNodeId: choice.targetNodeId,
        }
      : null;
  }
}
