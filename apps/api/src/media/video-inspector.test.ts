import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FfprobeVideoInspector, validateFfprobeOutput } from "./video-inspector.js";

const validOutput = {
  streams: [
    {
      codec_type: "video",
      codec_name: "h264",
      profile: "Main",
      level: 40,
      pix_fmt: "yuv420p",
      width: 1920,
      height: 1080,
      r_frame_rate: "30/1",
    },
    {
      codec_type: "audio",
      codec_name: "aac",
      sample_rate: "48000",
      channels: 2,
    },
  ],
  format: { format_name: "mov,mp4", duration: "4.000" },
};

describe("FFprobe 视频检测", () => {
  it("extracts validated media metadata", () => {
    expect(validateFfprobeOutput(validOutput)).toEqual({
      durationMs: 4000,
      width: 1920,
      height: 1080,
      videoCodec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      frameRate: 30,
    });
  });

  it("rejects unsupported resolution", () => {
    expect(() =>
      validateFfprobeOutput({
        ...validOutput,
        streams: [{ ...validOutput.streams[0], width: 720, height: 1280 }, validOutput.streams[1]!],
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_VIDEO_RESOLUTION" }));
  });

  it("rejects the checked-in legacy portrait MP4 until it is replaced", async () => {
    const filePath = fileURLToPath(
      new URL("../../../h5/public/media/chapter01/Node001.mp4", import.meta.url),
    );
    await expect(new FfprobeVideoInspector().inspect(filePath)).rejects.toMatchObject({
      code: "INVALID_VIDEO_RESOLUTION",
    });
  });
});
