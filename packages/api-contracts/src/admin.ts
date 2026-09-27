export type AdminContentStatusDto = "draft" | "active" | "disabled";
export type AdminVideoStatusDto =
  | "uploading"
  | "processing"
  | "ready"
  | "failed"
  | "disabled";

export interface AdminVideoAssetNodeReferenceDto {
  chapterCode: string;
  nodeId: string;
  nodeTitle: string;
}

export interface AdminVideoAssetDto {
  id: string;
  code: string;
  originalFilename: string;
  objectKey: string;
  playbackUrl: string | null;
  posterUrl: string | null;
  mimeType: string;
  fileSize: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  pixelFormat: string | null;
  frameRate: number | null;
  processingError: string | null;
  posterObjectKey: string | null;
  posterMimeType: string | null;
  posterFileSize: string | null;
  status: AdminVideoStatusDto;
  relatedNodes: AdminVideoAssetNodeReferenceDto[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateAdminVideoAssetRequest {
  playbackUrl?: string | null;
  posterUrl?: string | null;
  status?: AdminVideoStatusDto;
}

export interface AdminChapterSummaryDto {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: AdminContentStatusDto;
  entryNodeId: string | null;
  nodeCount: number;
  story: {
    code: string;
    title: string;
    status: AdminContentStatusDto;
  };
  character: {
    code: string;
    name: string;
    status: AdminContentStatusDto;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AdminChoiceRelationDto {
  id: string;
  label: string;
  sourceNodeId: string;
  targetNodeId: string;
  sortOrder: number;
  enabled: boolean;
}

export interface AdminNodeDto {
  id: string;
  title: string;
  message: string | null;
  type: "video" | "choice" | "ending";
  completionMode: "choices" | "next" | "end";
  status: AdminContentStatusDto;
  accessMode: "free" | "payment";
  videoAssetId: string | null;
  videoAssetStatus: AdminVideoStatusDto | null;
  nextNodeId: string | null;
  choices: AdminChoiceRelationDto[];
}

export interface AdminChapterDetailDto extends AdminChapterSummaryDto {
  nodes: AdminNodeDto[];
}

export interface UpdateAdminChapterStatusRequest {
  status: AdminContentStatusDto;
}
