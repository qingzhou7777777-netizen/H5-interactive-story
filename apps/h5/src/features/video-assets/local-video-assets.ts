import type { VideoAsset } from "./video-asset";

const chapter01MediaPath = "/media/chapter01";

function createChapter01Sources(nodeId: "Node001" | "Node002" | "Node003" | "Node004") {
  return [
    {
      src: `${chapter01MediaPath}/${nodeId}.mp4`,
      type: "video/mp4",
    },
  ] as const;
}

// 静态部署与 API 降级模式共用的“资源 ID -> 本地视频文件”映射。
export const localVideoAssets = {
  "chapter01-node001": {
    id: "chapter01-node001",
    poster: "/posters/node001.svg",
    sources: createChapter01Sources("Node001"),
  },
  "chapter01-node002": {
    id: "chapter01-node002",
    poster: "/posters/node002.svg",
    sources: createChapter01Sources("Node002"),
  },
  "chapter01-node003": {
    id: "chapter01-node003",
    poster: "/posters/node003.svg",
    sources: createChapter01Sources("Node003"),
  },
  "chapter01-node004": {
    id: "chapter01-node004",
    poster: "/posters/node004.svg",
    sources: createChapter01Sources("Node004"),
  },
} satisfies Readonly<Record<string, VideoAsset>>;

export function resolveLocalVideoAsset(videoAssetId?: string): VideoAsset | undefined {
  if (!videoAssetId) {
    return undefined;
  }

  return (localVideoAssets as Readonly<Record<string, VideoAsset>>)[videoAssetId];
}
