export interface VideoAssetSource {
  src: string;
  type: string;
}

export interface VideoAsset {
  id: string;
  poster: string;
  sources: readonly VideoAssetSource[];
}
