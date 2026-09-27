import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";
import * as jpeg from "jpeg-js";

import type { AdminContentRepository } from "../admin/admin-content-repository.js";
import type { AdminVideoAssetDto } from "@interactive-story/api-contracts";
import type { ObjectStorage } from "./object-storage.js";
import type {
  CompletePosterUploadInput,
  CompleteVideoUploadInput,
  VideoAssetProductionRepository,
} from "./video-asset-production-repository.js";
import { VideoAssetUploadService } from "./video-asset-upload-service.js";

const timestamp = "2026-09-20T08:00:00.000Z";

function atom(type: string, payload = Buffer.alloc(0)) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

function validMp4Bytes() {
  return Buffer.concat([atom("ftyp", Buffer.from("isom0000")), atom("moov")]);
}

function validJpegBytes() {
  return jpeg.encode(
    { data: Buffer.alloc(1920 * 1080 * 4), width: 1920, height: 1080 },
    10,
  ).data;
}

function createHarness() {
  let asset: AdminVideoAssetDto = {
    id: "asset-id",
    code: "chapter01-node001",
    originalFilename: "old.mp4",
    objectKey: "videos/old.mp4",
    playbackUrl: "https://media.example/videos/old.mp4",
    posterUrl: null,
    mimeType: "video/mp4",
    fileSize: "10",
    durationMs: 1000,
    width: 720,
    height: 1280,
    checksum: "old",
    videoCodec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    frameRate: 30,
    processingError: null,
    posterObjectKey: null,
    posterMimeType: null,
    posterFileSize: null,
    status: "ready",
    relatedNodes: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const transitions: string[] = [];
  const storedKeys: string[] = [];

  const contentRepository: AdminContentRepository = {
    async listVideoAssets() { return [asset]; },
    async getVideoAsset(code) { return code === asset.code ? asset : null; },
    async updateVideoAsset() { return asset; },
    async listChapters() { return []; },
    async getChapter() { return null; },
    async updateChapterStatus() { return null; },
  };
  const productionRepository: VideoAssetProductionRepository = {
    async findTarget(code) {
      return code === asset.code
        ? { code, objectKey: asset.objectKey, posterObjectKey: asset.posterObjectKey }
        : null;
    },
    async markUploading() { transitions.push("uploading"); asset = { ...asset, status: "uploading" }; },
    async markProcessing() { transitions.push("processing"); asset = { ...asset, status: "processing" }; },
    async markFailed(_code, message) {
      transitions.push("failed");
      asset = { ...asset, status: "failed", processingError: message };
    },
    async completeVideoUpload(_code, input: CompleteVideoUploadInput) {
      transitions.push("ready");
      asset = {
        ...asset,
        originalFilename: input.originalFilename,
        objectKey: input.objectKey,
        playbackUrl: input.playbackUrl,
        mimeType: input.mimeType,
        fileSize: input.fileSize.toString(),
        durationMs: input.durationMs,
        width: input.width,
        height: input.height,
        checksum: input.checksum,
        videoCodec: input.videoCodec,
        audioCodec: input.audioCodec,
        pixelFormat: input.pixelFormat,
        frameRate: input.frameRate,
        processingError: null,
        status: "ready",
      };
    },
    async completePosterUpload(_code, input: CompletePosterUploadInput) {
      asset = {
        ...asset,
        posterObjectKey: input.objectKey,
        posterUrl: input.posterUrl,
        posterMimeType: input.mimeType,
        posterFileSize: input.fileSize.toString(),
      };
    },
  };
  const storage: ObjectStorage = {
    async putObject(input) {
      for await (const _chunk of input.body) {
        // Consume the stream like an S3 client.
      }
      storedKeys.push(input.key);
    },
    async deleteObject() {},
    getPublicUrl(key) { return `https://media.example/${key}`; },
  };
  const service = new VideoAssetUploadService(
    contentRepository,
    productionRepository,
    storage,
    {
      async inspect() {
        return {
          durationMs: 4000,
          width: 1920,
          height: 1080,
          videoCodec: "h264",
          audioCodec: "aac",
          pixelFormat: "yuv420p",
          frameRate: 30,
        };
      },
    },
    1024 * 1024,
  );
  return { service, transitions, storedKeys, getAsset: () => asset };
}

describe("VideoAssetUploadService", () => {
  it("moves a valid video through UPLOADING, PROCESSING, and READY", async () => {
    const harness = createHarness();
    const result = await harness.service.uploadVideo("chapter01-node001", {
      filename: "Node001.mp4",
      mimeType: "video/mp4",
      stream: Readable.from(validMp4Bytes()),
    });

    expect(harness.transitions).toEqual(["uploading", "processing", "ready"]);
    expect(harness.storedKeys[0]).toMatch(/^videos\/chapter01-node001\/.+\.mp4$/);
    expect(result).toMatchObject({
      status: "ready",
      videoCodec: "h264",
      width: 1920,
      height: 1080,
    });
  });

  it("records FAILED when basic video validation fails", async () => {
    const harness = createHarness();
    await expect(
      harness.service.uploadVideo("chapter01-node001", {
        filename: "Node001.mov",
        mimeType: "video/quicktime",
        stream: Readable.from(Buffer.from("invalid")),
      }),
    ).rejects.toMatchObject({ code: "INVALID_VIDEO_FORMAT" });
    expect(harness.transitions).toEqual(["uploading", "failed"]);
    expect(harness.getAsset()).toMatchObject({ status: "failed" });
  });

  it("uploads and records a valid JPEG poster", async () => {
    const harness = createHarness();
    const result = await harness.service.uploadPoster("chapter01-node001", {
      filename: "Node001.jpg",
      mimeType: "image/jpeg",
      stream: Readable.from(validJpegBytes()),
    });
    expect(result.posterObjectKey).toMatch(/^posters\/chapter01-node001\/.+\.jpg$/);
    expect(result.posterUrl).toMatch(/^https:\/\/media\.example\/posters\//);
  });
});
