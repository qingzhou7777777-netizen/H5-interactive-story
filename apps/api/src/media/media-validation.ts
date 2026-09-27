import { open } from "node:fs/promises";
import { extname } from "node:path";

import * as jpeg from "jpeg-js";

export type MediaPipelineErrorCode =
  | "VIDEO_ASSET_NOT_FOUND"
  | "UPLOAD_REQUIRED"
  | "UPLOAD_TOO_LARGE"
  | "INVALID_VIDEO_FORMAT"
  | "INVALID_VIDEO_MIME"
  | "INVALID_VIDEO_CODEC"
  | "INVALID_VIDEO_RESOLUTION"
  | "INVALID_VIDEO_STREAMS"
  | "INVALID_VIDEO_WEB_FORMAT"
  | "INVALID_POSTER"
  | "OBJECT_STORAGE_FAILED"
  | "VIDEO_PROCESSING_FAILED";

export class MediaPipelineError extends Error {
  constructor(
    readonly code: MediaPipelineErrorCode,
    message: string,
    readonly statusCode = 422,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaPipelineError";
  }
}

export function assertMp4Upload(filename: string, mimeType: string) {
  if (extname(filename).toLowerCase() !== ".mp4") {
    throw new MediaPipelineError("INVALID_VIDEO_FORMAT", "视频文件必须使用 .mp4 扩展名。");
  }
  if (mimeType.toLowerCase() !== "video/mp4") {
    throw new MediaPipelineError("INVALID_VIDEO_MIME", "视频 MIME 必须是 video/mp4。");
  }
}

export async function assertMp4FileSignature(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead < 12 || header.toString("ascii", 4, 8) !== "ftyp") {
      throw new MediaPipelineError("INVALID_VIDEO_FORMAT", "文件内容不是有效的 MP4 容器。");
    }
  } finally {
    await handle.close();
  }
}

export async function assertMp4FastStart(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    let offset = 0;
    while (offset + 8 <= size) {
      const header = Buffer.alloc(16);
      const { bytesRead } = await handle.read(header, 0, header.length, offset);
      if (bytesRead < 8) break;
      const atomType = header.toString("ascii", 4, 8);
      const size32 = header.readUInt32BE(0);
      let atomSize = size32;
      if (size32 === 1) {
        if (bytesRead < 16) break;
        const size64 = header.readBigUInt64BE(8);
        if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) break;
        atomSize = Number(size64);
      } else if (size32 === 0) {
        atomSize = size - offset;
      }
      if (atomSize < 8 || offset + atomSize > size) break;
      if (atomType === "moov") return;
      if (atomType === "mdat") {
        throw new MediaPipelineError(
          "INVALID_VIDEO_WEB_FORMAT",
          "MP4 必须启用 Fast Start，moov 必须位于 mdat 之前。",
        );
      }
      offset += atomSize;
    }
    throw new MediaPipelineError(
      "INVALID_VIDEO_WEB_FORMAT",
      "无法确认 MP4 的 Fast Start 结构。",
    );
  } finally {
    await handle.close();
  }
}

export interface JpegMetadata {
  width: number;
  height: number;
}

const jpegStartOfFrameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function inspectJpeg(
  filename: string,
  mimeType: string,
  bytes: Buffer,
): JpegMetadata {
  const extension = extname(filename).toLowerCase();
  if (!new Set([".jpg", ".jpeg"]).has(extension) || mimeType.toLowerCase() !== "image/jpeg") {
    throw new MediaPipelineError("INVALID_POSTER", "封面必须是 MIME 为 image/jpeg 的 JPEG 文件。");
  }
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new MediaPipelineError("INVALID_POSTER", "封面内容不是有效的 JPEG 文件。");
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (jpegStartOfFrameMarkers.has(marker) && segmentLength >= 7) {
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (width !== 1920 || height !== 1080) {
        throw new MediaPipelineError(
          "INVALID_POSTER",
          `封面分辨率必须是 1920 × 1080，当前为 ${width} × ${height}。`,
        );
      }
      try {
        const decoded = jpeg.decode(bytes, {
          useTArray: true,
          tolerantDecoding: false,
          maxResolutionInMP: 3,
          maxMemoryUsageInMB: 64,
        });
        if (decoded.width !== width || decoded.height !== height) {
          throw new Error("JPEG dimensions changed while decoding.");
        }
      } catch (error) {
        throw new MediaPipelineError(
          "INVALID_POSTER",
          "JPEG 封面内容损坏或无法完整解码。",
          422,
          { cause: error },
        );
      }
      return { width, height };
    }
    offset += segmentLength;
  }

  throw new MediaPipelineError("INVALID_POSTER", "无法读取 JPEG 封面尺寸。");
}
