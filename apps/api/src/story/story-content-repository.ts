import type {
  ChapterDto,
  NodeDto,
  SubmitChoiceResponse,
  VideoAssetDto,
} from "@interactive-story/api-contracts";

export interface StoryContentRepository {
  getChapter(chapterCode: string): Promise<ChapterDto | null>;
  getNode(chapterCode: string, nodeId: string): Promise<NodeDto | null>;
  getVideoAsset(assetId: string): Promise<VideoAssetDto | null>;
  submitChoice(
    chapterCode: string,
    nodeId: string,
    choiceId: string,
  ): Promise<SubmitChoiceResponse | null>;
}
