import type { ChapterDto, NodeDto, VideoAssetDto } from "@interactive-story/api-contracts";
import type { VideoStoryNode } from "@interactive-story/story-core";

import type { StoryContent } from "../../features/story-content/story-content";

export interface LandingStoryCard {
  id: string;
  title: string;
  tag: string;
  posterUrl: string | null;
  chapterTitle: string;
  characterName: string;
}

export interface LandingStoryCatalog {
  chapterCode: string;
  storyTitle: string;
  chapterTitle: string;
  description: string | null;
  characterName: string;
  heroPosterUrl: string | null;
  cards: LandingStoryCard[];
}

function getNodeTag(node: NodeDto, entryNodeId: string) {
  if (node.id === entryNodeId) {
    return "主线开场";
  }
  if (node.accessMode === "payment") {
    return "解锁剧情";
  }
  if (node.completionMode === "choices") {
    return `${node.choices.length} 个选择`;
  }
  return "剧情分支";
}

function videoForNode(node: NodeDto, assets: ReadonlyMap<string, VideoAssetDto>) {
  return node.videoAssetId ? assets.get(node.videoAssetId) : undefined;
}

export function buildLandingStoryCatalog(chapter: ChapterDto): LandingStoryCatalog {
  const assets = new Map(chapter.videoAssets.map((asset) => [asset.id, asset]));
  const videoNodes = chapter.nodes.filter(
    (node) => node.type === "video" && videoForNode(node, assets),
  );
  const entryNode =
    videoNodes.find((node) => node.id === chapter.entryNodeId) ?? videoNodes[0];
  const entryVideo = entryNode ? videoForNode(entryNode, assets) : undefined;

  return {
    chapterCode: chapter.code,
    storyTitle: chapter.story.title,
    chapterTitle: chapter.title,
    description:
      chapter.description ?? chapter.story.description ?? chapter.character.description,
    characterName: chapter.character.name,
    heroPosterUrl:
      chapter.character.coverUrl ?? entryVideo?.posterUrl ?? entryVideo?.playbackUrl ?? null,
    cards: videoNodes.map((node) => {
      const video = videoForNode(node, assets)!;
      return {
        id: node.id,
        title: node.title,
        tag: getNodeTag(node, chapter.entryNodeId),
        posterUrl: video.posterUrl,
        chapterTitle: chapter.title,
        characterName: chapter.character.name,
      };
    }),
  };
}

function getStaticNodeTag(node: VideoStoryNode, entryNodeId: string) {
  if (node.id === entryNodeId) {
    return "主线开场";
  }
  if (node.onComplete.type === "choices") {
    return `${node.onComplete.choices.length} 个选择`;
  }
  return "剧情分支";
}

export function buildStaticLandingStoryCatalog(
  content: StoryContent,
): LandingStoryCatalog {
  const videoNodes = Object.values(content.story.nodes).filter(
    (node): node is VideoStoryNode =>
      node.type === "video" &&
      Boolean(node.videoAssetId && content.videoAssets[node.videoAssetId]),
  );
  const entryNode =
    videoNodes.find((node) => node.id === content.story.entryNodeId) ?? videoNodes[0];
  const entryVideo = entryNode?.videoAssetId
    ? content.videoAssets[entryNode.videoAssetId]
    : undefined;

  return {
    chapterCode: content.chapterCode,
    storyTitle: content.storyTitle,
    chapterTitle: content.chapterTitle,
    description: content.character.description,
    characterName: content.character.name,
    heroPosterUrl: entryVideo?.poster || entryVideo?.sources[0]?.src || null,
    cards: videoNodes.map((node) => {
      const video = content.videoAssets[node.videoAssetId!]!;
      return {
        id: node.id,
        title: node.title,
        tag: getStaticNodeTag(node, content.story.entryNodeId),
        posterUrl: video.poster || video.sources[0]?.src || null,
        chapterTitle: content.chapterTitle,
        characterName: content.character.name,
      };
    }),
  };
}
