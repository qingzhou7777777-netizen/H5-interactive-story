import type {
  AdminChapterDetailDto,
  AdminChapterSummaryDto,
  AdminContentStatusDto,
  AdminVideoAssetDto,
  UpdateAdminVideoAssetRequest,
} from "@interactive-story/api-contracts";

export class AdminContentValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AdminContentValidationError";
  }
}

export interface AdminContentRepository {
  listVideoAssets(): Promise<AdminVideoAssetDto[]>;
  getVideoAsset(assetCode: string): Promise<AdminVideoAssetDto | null>;
  updateVideoAsset(
    assetCode: string,
    input: UpdateAdminVideoAssetRequest,
  ): Promise<AdminVideoAssetDto | null>;
  listChapters(): Promise<AdminChapterSummaryDto[]>;
  getChapter(chapterCode: string): Promise<AdminChapterDetailDto | null>;
  updateChapterStatus(
    chapterCode: string,
    status: AdminContentStatusDto,
  ): Promise<AdminChapterDetailDto | null>;
}
