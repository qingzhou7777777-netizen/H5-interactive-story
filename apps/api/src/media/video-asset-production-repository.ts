export interface VideoAssetProductionTarget {
  code: string;
  objectKey: string;
  posterObjectKey: string | null;
}

export interface CompleteVideoUploadInput {
  originalFilename: string;
  objectKey: string;
  playbackUrl: string;
  mimeType: string;
  fileSize: bigint;
  durationMs: number;
  width: number;
  height: number;
  checksum: string;
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  frameRate: number;
}

export interface CompletePosterUploadInput {
  objectKey: string;
  posterUrl: string;
  mimeType: string;
  fileSize: bigint;
}

export interface VideoAssetProductionRepository {
  findTarget(assetCode: string): Promise<VideoAssetProductionTarget | null>;
  markUploading(assetCode: string): Promise<void>;
  markProcessing(assetCode: string): Promise<void>;
  markFailed(assetCode: string, message: string): Promise<void>;
  completeVideoUpload(assetCode: string, input: CompleteVideoUploadInput): Promise<void>;
  completePosterUpload(assetCode: string, input: CompletePosterUploadInput): Promise<void>;
}
