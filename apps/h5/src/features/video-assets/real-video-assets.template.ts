import type { VideoAsset } from "./video-asset";

const chapter01MediaPath = "/media/chapter01";

function createChapter01Asset(
  nodeId: "Node001" | "Node002" | "Node003" | "Node004",
) {
  return {
    id: `chapter01-${nodeId.toLowerCase()}`,
    poster: `${chapter01MediaPath}/${nodeId}.jpg`,
    sources: [
      {
        src: `${chapter01MediaPath}/${nodeId}.mp4`,
        type: "video/mp4",
      },
    ],
  } satisfies VideoAsset;
}

// 正式素材接入模板：八个文件全部上传并验收后，用本清单替换本地占位清单。
// 在文件缺失时不要直接启用，否则播放器会按设计进入加载失败与重试流程。
export const realVideoAssetsTemplate = {
  "chapter01-node001": createChapter01Asset("Node001"),
  "chapter01-node002": createChapter01Asset("Node002"),
  "chapter01-node003": createChapter01Asset("Node003"),
  "chapter01-node004": createChapter01Asset("Node004"),
} satisfies Readonly<Record<string, VideoAsset>>;

export function resolveRealVideoAsset(videoAssetId?: string): VideoAsset | undefined {
  if (!videoAssetId) {
    return undefined;
  }

  return (realVideoAssetsTemplate as Readonly<Record<string, VideoAsset>>)[videoAssetId];
}
