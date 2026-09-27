import { describe, expect, it } from "vitest";
import * as jpeg from "jpeg-js";

import {
  MediaPipelineError,
  assertMp4Upload,
  inspectJpeg,
} from "./media-validation.js";

function createJpeg(width: number, height: number) {
  return jpeg.encode({ data: Buffer.alloc(width * height * 4), width, height }, 10).data;
}

describe("媒体基础校验", () => {
  it("accepts only MP4 filenames and MIME", () => {
    expect(() => assertMp4Upload("Node001.mp4", "video/mp4")).not.toThrow();
    expect(() => assertMp4Upload("Node001.mov", "video/mp4")).toThrowError(
      expect.objectContaining({ code: "INVALID_VIDEO_FORMAT" }),
    );
    expect(() => assertMp4Upload("Node001.mp4", "application/octet-stream")).toThrowError(
      expect.objectContaining({ code: "INVALID_VIDEO_MIME" }),
    );
  });

  it("reads and validates a 1920 × 1080 JPEG cover", () => {
    expect(inspectJpeg("Node001.jpg", "image/jpeg", createJpeg(1920, 1080))).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  it("rejects an invalid JPEG resolution", () => {
    expect(() => inspectJpeg("Node001.jpg", "image/jpeg", createJpeg(640, 960))).toThrowError(
      expect.objectContaining<Partial<MediaPipelineError>>({ code: "INVALID_POSTER" }),
    );
  });
});
