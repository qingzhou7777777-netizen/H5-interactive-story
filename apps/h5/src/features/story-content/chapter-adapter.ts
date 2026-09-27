import type { ChapterDto, NodeDto } from "@interactive-story/api-contracts";
import type {
  RuntimeStoryDefinition,
  StoryNode,
  VideoCompletion,
} from "@interactive-story/story-core";

import type { VideoAsset } from "../video-assets/video-asset";
import type { StoryContent } from "./story-content";

function requireNodeReference(value: string | null, nodeId: string, field: string) {
  if (!value) {
    throw new Error(`节点 ${nodeId} 缺少 ${field}。`);
  }
  return value;
}

function adaptVideoCompletion(node: NodeDto): VideoCompletion {
  switch (node.completionMode) {
    case "choices":
      if (node.choices.length === 0) {
        throw new Error(`视频节点 ${node.id} 没有可用选项。`);
      }
      return {
        type: "choices",
        choices: node.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          targetNodeId: choice.targetNodeId,
        })),
      };
    case "next":
      return {
        type: "next",
        targetNodeId: requireNodeReference(node.nextNodeId, node.id, "nextNodeId"),
      };
    case "end":
      return { type: "end" };
  }
}

function adaptNode(node: NodeDto): StoryNode {
  switch (node.type) {
    case "video":
      return {
        id: node.id,
        type: "video",
        title: node.title,
        ...(node.videoAssetId ? { videoAssetId: node.videoAssetId } : {}),
        onComplete: adaptVideoCompletion(node),
      };
    case "choice":
      if (node.choices.length === 0) {
        throw new Error(`选择节点 ${node.id} 没有可用选项。`);
      }
      return {
        id: node.id,
        type: "choice",
        title: node.title,
        choices: node.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          targetNodeId: choice.targetNodeId,
        })),
      };
    case "ending":
      return {
        id: node.id,
        type: "ending",
        title: node.title,
        ...(node.message ? { message: node.message } : {}),
      };
  }
}

export function adaptChapterDto(chapter: ChapterDto): StoryContent {
  const nodes = Object.fromEntries(
    chapter.nodes.map((node) => [node.id, adaptNode(node)] as const),
  );

  if (!nodes[chapter.entryNodeId]) {
    throw new Error(`章节入口节点 ${chapter.entryNodeId} 不存在。`);
  }

  for (const node of Object.values(nodes)) {
    const targets =
      node.type === "choice"
        ? node.choices.map((choice) => choice.targetNodeId)
        : node.type === "video" && node.onComplete.type === "choices"
          ? node.onComplete.choices.map((choice) => choice.targetNodeId)
          : node.type === "video" && node.onComplete.type === "next"
            ? [node.onComplete.targetNodeId]
            : [];

    for (const targetNodeId of targets) {
      if (!nodes[targetNodeId]) {
        throw new Error(`节点 ${node.id} 指向不存在的节点 ${targetNodeId}。`);
      }
    }
  }

  const videoAssets = Object.fromEntries(
    chapter.videoAssets.map(
      (asset): readonly [string, VideoAsset] => [
        asset.id,
        {
          id: asset.id,
          poster: asset.posterUrl ?? "",
          sources: [{ src: asset.playbackUrl, type: asset.mimeType }],
        },
      ],
    ),
  );

  const story: RuntimeStoryDefinition = {
    id: `${chapter.story.code}:${chapter.code}`,
    title: chapter.story.title,
    entryNodeId: chapter.entryNodeId,
    nodes,
  };

  return {
    source: "api",
    chapterCode: chapter.code,
    chapterTitle: chapter.title,
    storyTitle: chapter.story.title,
    character: {
      code: chapter.character.code,
      name: chapter.character.name,
      avatarUrl: chapter.character.avatarUrl,
      description: chapter.character.description,
    },
    story,
    videoAssets,
  };
}
