import type { ChapterDto, NodeDto, VideoAssetDto } from "@interactive-story/api-contracts";

const branchDefinitions = [
  ["Node002", "Ending002", "去图书馆"],
  ["Node003", "Ending003", "一起去游泳"],
  ["Node004", "Ending004", "去水上乐园"],
] as const;

const branchNodes: NodeDto[] = branchDefinitions.flatMap(
  ([nodeId, endingId, title]) => [
    {
      id: nodeId,
      title,
      type: "video",
      completionMode: "next",
      message: null,
      videoAssetId: `chapter01-${nodeId.toLowerCase()}`,
      nextNodeId: endingId,
      accessMode: "free",
      choices: [],
    },
    {
      id: endingId,
      title: "解锁下一章",
      type: "ending",
      completionMode: "end",
      message: "解锁下一章，继续你的专属恋爱互动剧情。",
      videoAssetId: null,
      nextNodeId: null,
      accessMode: "free",
      choices: [],
    },
  ],
);

const videoAssets: VideoAssetDto[] = ["Node001", "Node002", "Node003", "Node004"].map(
  (nodeId) => ({
    id: `chapter01-${nodeId.toLowerCase()}`,
    playbackUrl: `/media/chapter01/${nodeId}.mp4`,
    posterUrl: `/media/chapter01/${nodeId}.jpg`,
    mimeType: "video/mp4",
    durationMs: 5_000,
    width: 720,
    height: 1280,
  }),
);

export const storyApiFixture: ChapterDto = {
  id: "chapter-db-id",
  code: "chapter-01",
  title: "第一次见面",
  description: "H5 API 测试章节",
  entryNodeId: "Node001",
  story: {
    id: "story-db-id",
    code: "ai-romance-demo",
    title: "AI 恋爱互动剧情",
    description: null,
  },
  character: {
    code: "lin-wan",
    name: "林晚 API",
    avatarUrl: null,
    coverUrl: null,
    description: null,
  },
  nodes: [
    {
      id: "Node001",
      title: "第一次见面",
      type: "video",
      completionMode: "choices",
      message: null,
      videoAssetId: "chapter01-node001",
      nextNodeId: null,
      accessMode: "free",
      choices: [
        { id: "A", label: "去图书馆", targetNodeId: "Node002", sortOrder: 1 },
        { id: "B", label: "一起去游泳", targetNodeId: "Node003", sortOrder: 2 },
        { id: "C", label: "去水上乐园", targetNodeId: "Node004", sortOrder: 3 },
      ],
    },
    ...branchNodes,
  ],
  videoAssets,
};
