import { VideoStatus, type PrismaClient } from "@prisma/client";

import type {
  CompletePosterUploadInput,
  CompleteVideoUploadInput,
  VideoAssetProductionRepository,
} from "../media/video-asset-production-repository.js";

export class PrismaVideoAssetProductionRepository
  implements VideoAssetProductionRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findTarget(assetCode: string) {
    return this.prisma.videoAsset.findUnique({
      where: { code: assetCode },
      select: { code: true, objectKey: true, posterObjectKey: true },
    });
  }

  async markUploading(assetCode: string) {
    await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data: { status: VideoStatus.UPLOADING, processingError: null },
    });
  }

  async markProcessing(assetCode: string) {
    await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data: { status: VideoStatus.PROCESSING, processingError: null },
    });
  }

  async markFailed(assetCode: string, message: string) {
    await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data: { status: VideoStatus.FAILED, processingError: message.slice(0, 2_000) },
    });
  }

  async completeVideoUpload(assetCode: string, input: CompleteVideoUploadInput) {
    await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data: {
        originalFilename: input.originalFilename,
        objectKey: input.objectKey,
        playbackPath: input.playbackUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        durationMs: input.durationMs,
        width: input.width,
        height: input.height,
        checksum: input.checksum,
        videoCodec: input.videoCodec,
        audioCodec: input.audioCodec,
        pixelFormat: input.pixelFormat,
        frameRate: input.frameRate,
        processingError: null,
        status: VideoStatus.READY,
      },
    });
  }

  async completePosterUpload(assetCode: string, input: CompletePosterUploadInput) {
    await this.prisma.videoAsset.update({
      where: { code: assetCode },
      data: {
        posterObjectKey: input.objectKey,
        posterPath: input.posterUrl,
        posterMimeType: input.mimeType,
        posterFileSize: input.fileSize,
      },
    });
  }
}
