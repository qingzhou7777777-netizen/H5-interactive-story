import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rmdir, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { AdminVideoAssetDto } from "@interactive-story/api-contracts";

import type { AdminContentRepository } from "../admin/admin-content-repository.js";
import {
  MediaPipelineError,
  assertMp4FastStart,
  assertMp4FileSignature,
  assertMp4Upload,
  inspectJpeg,
} from "./media-validation.js";
import { ObjectStorageError, type ObjectStorage } from "./object-storage.js";
import type { VideoAssetProductionRepository } from "./video-asset-production-repository.js";
import type { VideoInspector } from "./video-inspector.js";

export interface UploadedFile {
  filename: string;
  mimeType: string;
  stream: Readable;
}

export interface VideoAssetUploadUseCase {
  readonly maxVideoBytes: number;
  readonly maxPosterBytes: number;
  uploadVideo(assetCode: string, upload: UploadedFile): Promise<AdminVideoAssetDto>;
  uploadPoster(assetCode: string, upload: UploadedFile): Promise<AdminVideoAssetDto>;
}

interface StoredTemporaryFile {
  directory: string;
  filePath: string;
  fileSize: number;
  checksum: string;
}

function safeAssetCode(assetCode: string) {
  return assetCode.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function failureMessage(error: unknown) {
  if (error instanceof MediaPipelineError || error instanceof ObjectStorageError) {
    return error.message;
  }
  return "视频处理发生未知错误。";
}

export class VideoAssetUploadService implements VideoAssetUploadUseCase {
  readonly maxPosterBytes = 300 * 1024;

  constructor(
    private readonly contentRepository: AdminContentRepository,
    private readonly productionRepository: VideoAssetProductionRepository,
    private readonly storage: ObjectStorage,
    private readonly inspector: VideoInspector,
    readonly maxVideoBytes: number,
  ) {}

  private async getResult(assetCode: string) {
    const result = await this.contentRepository.getVideoAsset(assetCode);
    if (!result) {
      throw new MediaPipelineError("VIDEO_ASSET_NOT_FOUND", "视频资源不存在。", 404);
    }
    return result;
  }

  private async saveTemporaryFile(upload: UploadedFile, maxBytes: number) {
    const directory = await mkdtemp(join(tmpdir(), "interactive-story-upload-"));
    const filePath = join(directory, "payload");
    const hash = createHash("sha256");
    let fileSize = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        fileSize += chunk.length;
        if (fileSize > maxBytes) {
          callback(
            new MediaPipelineError(
              "UPLOAD_TOO_LARGE",
              `上传文件超过 ${Math.floor(maxBytes / 1024 / 1024) || 1} MB 限制。`,
              413,
            ),
          );
          return;
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
      await pipeline(upload.stream, meter, createWriteStream(filePath, { flags: "wx" }));
      if (fileSize === 0) {
        throw new MediaPipelineError("UPLOAD_REQUIRED", "上传文件不能为空。", 400);
      }
      return {
        directory,
        filePath,
        fileSize,
        checksum: hash.digest("hex"),
      } satisfies StoredTemporaryFile;
    } catch (error) {
      await unlink(filePath).catch(() => undefined);
      await rmdir(directory).catch(() => undefined);
      throw error;
    }
  }

  private async removeTemporaryFile(file: StoredTemporaryFile) {
    await unlink(file.filePath).catch(() => undefined);
    await rmdir(file.directory).catch(() => undefined);
  }

  private async deleteReplacedObject(key: string | null, replacementKey: string) {
    if (!key || key === replacementKey) return;
    await this.storage.deleteObject(key).catch(() => undefined);
  }

  async uploadVideo(assetCode: string, upload: UploadedFile) {
    const target = await this.productionRepository.findTarget(assetCode);
    if (!target) {
      throw new MediaPipelineError("VIDEO_ASSET_NOT_FOUND", "视频资源不存在。", 404);
    }

    await this.productionRepository.markUploading(assetCode);
    let temporaryFile: StoredTemporaryFile | null = null;
    let newObjectKey: string | null = null;
    try {
      assertMp4Upload(upload.filename, upload.mimeType);
      temporaryFile = await this.saveTemporaryFile(upload, this.maxVideoBytes);
      await assertMp4FileSignature(temporaryFile.filePath);
      await assertMp4FastStart(temporaryFile.filePath);
      await this.productionRepository.markProcessing(assetCode);
      const metadata = await this.inspector.inspect(temporaryFile.filePath);

      newObjectKey = `videos/${safeAssetCode(assetCode)}/${randomUUID()}.mp4`;
      await this.storage.putObject({
        key: newObjectKey,
        body: createReadStream(temporaryFile.filePath),
        contentType: "video/mp4",
        contentLength: temporaryFile.fileSize,
      });
      const playbackUrl = this.storage.getPublicUrl(newObjectKey);
      await this.productionRepository.completeVideoUpload(assetCode, {
        originalFilename: basename(upload.filename),
        objectKey: newObjectKey,
        playbackUrl,
        mimeType: "video/mp4",
        fileSize: BigInt(temporaryFile.fileSize),
        durationMs: metadata.durationMs,
        width: metadata.width,
        height: metadata.height,
        checksum: temporaryFile.checksum,
        videoCodec: metadata.videoCodec,
        audioCodec: metadata.audioCodec,
        pixelFormat: metadata.pixelFormat,
        frameRate: metadata.frameRate,
      });
      await this.deleteReplacedObject(target.objectKey, newObjectKey);
      return this.getResult(assetCode);
    } catch (error) {
      if (newObjectKey) {
        await this.storage.deleteObject(newObjectKey).catch(() => undefined);
      }
      await this.productionRepository.markFailed(assetCode, failureMessage(error));
      if (error instanceof MediaPipelineError) throw error;
      if (error instanceof ObjectStorageError) {
        throw new MediaPipelineError("OBJECT_STORAGE_FAILED", error.message, 502, {
          cause: error,
        });
      }
      throw new MediaPipelineError(
        "VIDEO_PROCESSING_FAILED",
        "视频处理失败。",
        500,
        { cause: error },
      );
    } finally {
      if (temporaryFile) await this.removeTemporaryFile(temporaryFile);
    }
  }

  async uploadPoster(assetCode: string, upload: UploadedFile) {
    const target = await this.productionRepository.findTarget(assetCode);
    if (!target) {
      throw new MediaPipelineError("VIDEO_ASSET_NOT_FOUND", "视频资源不存在。", 404);
    }

    let temporaryFile: StoredTemporaryFile | null = null;
    let newObjectKey: string | null = null;
    try {
      temporaryFile = await this.saveTemporaryFile(upload, this.maxPosterBytes);
      const bytes = await readFile(temporaryFile.filePath);
      inspectJpeg(upload.filename, upload.mimeType, bytes);

      newObjectKey = `posters/${safeAssetCode(assetCode)}/${randomUUID()}.jpg`;
      await this.storage.putObject({
        key: newObjectKey,
        body: createReadStream(temporaryFile.filePath),
        contentType: "image/jpeg",
        contentLength: temporaryFile.fileSize,
      });
      const posterUrl = this.storage.getPublicUrl(newObjectKey);
      await this.productionRepository.completePosterUpload(assetCode, {
        objectKey: newObjectKey,
        posterUrl,
        mimeType: "image/jpeg",
        fileSize: BigInt(temporaryFile.fileSize),
      });
      await this.deleteReplacedObject(target.posterObjectKey, newObjectKey);
      return this.getResult(assetCode);
    } catch (error) {
      if (newObjectKey) {
        await this.storage.deleteObject(newObjectKey).catch(() => undefined);
      }
      if (error instanceof MediaPipelineError) throw error;
      if (error instanceof ObjectStorageError) {
        throw new MediaPipelineError("OBJECT_STORAGE_FAILED", error.message, 502, {
          cause: error,
        });
      }
      throw new MediaPipelineError("INVALID_POSTER", "封面上传失败。", 422, {
        cause: error,
      });
    } finally {
      if (temporaryFile) await this.removeTemporaryFile(temporaryFile);
    }
  }
}
