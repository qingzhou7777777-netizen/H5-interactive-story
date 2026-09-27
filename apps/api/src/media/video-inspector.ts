import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

import { MediaPipelineError } from "./media-validation.js";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const bundledFfprobePath = (require("ffprobe-static") as { path: string }).path;

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  level?: number;
  pix_fmt?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    duration?: string;
  };
}

export interface VideoMetadata {
  durationMs: number;
  width: number;
  height: number;
  videoCodec: string;
  audioCodec: string;
  pixelFormat: string;
  frameRate: number;
}

export interface VideoInspector {
  inspect(filePath: string): Promise<VideoMetadata>;
}

function parseFrameRate(value: string | undefined) {
  if (!value) return 0;
  const [numeratorText, denominatorText = "1"] = value.split("/");
  const numerator = Number(numeratorText);
  const denominator = Number(denominatorText);
  return denominator > 0 ? numerator / denominator : 0;
}

export function validateFfprobeOutput(output: FfprobeOutput): VideoMetadata {
  const streams = output.streams ?? [];
  const videoStreams = streams.filter((stream) => stream.codec_type === "video");
  const audioStreams = streams.filter((stream) => stream.codec_type === "audio");
  if (videoStreams.length !== 1 || audioStreams.length !== 1) {
    throw new MediaPipelineError(
      "INVALID_VIDEO_STREAMS",
      "MP4 必须只包含一个视频流和一个音频流。",
    );
  }

  const video = videoStreams[0]!;
  const audio = audioStreams[0]!;
  if (video.codec_name !== "h264" || audio.codec_name !== "aac") {
    throw new MediaPipelineError(
      "INVALID_VIDEO_CODEC",
      `视频必须使用 H.264 + AAC，当前为 ${video.codec_name ?? "未知"} + ${audio.codec_name ?? "未知"}。`,
    );
  }
  if (video.width !== 1920 || video.height !== 1080) {
    throw new MediaPipelineError(
      "INVALID_VIDEO_RESOLUTION",
      `视频分辨率必须是 1920 × 1080，当前为 ${video.width ?? "?"} × ${video.height ?? "?"}。`,
    );
  }
  if (video.pix_fmt !== "yuv420p") {
    throw new MediaPipelineError(
      "INVALID_VIDEO_CODEC",
      `视频像素格式必须是 yuv420p，当前为 ${video.pix_fmt ?? "未知"}。`,
    );
  }
  const frameRate = parseFrameRate(video.r_frame_rate);
  if (![25, 30].some((rate) => Math.abs(rate - frameRate) < 0.01)) {
    throw new MediaPipelineError(
      "INVALID_VIDEO_CODEC",
      `视频帧率必须是 25 或 30 fps，当前为 ${frameRate || "未知"}。`,
    );
  }
  if (Number(audio.sample_rate) !== 48_000 || audio.channels !== 2) {
    throw new MediaPipelineError(
      "INVALID_VIDEO_CODEC",
      "音频必须是 48 kHz 双声道 AAC。",
    );
  }

  const durationMs = Math.round(Number(output.format?.duration ?? 0) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new MediaPipelineError("INVALID_VIDEO_FORMAT", "无法读取有效的视频时长。");
  }

  return {
    durationMs,
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    pixelFormat: video.pix_fmt,
    frameRate,
  };
}

export class FfprobeVideoInspector implements VideoInspector {
  constructor(
    private readonly ffprobePath = process.env.FFPROBE_PATH ?? bundledFfprobePath,
    private readonly timeoutMs = Number(process.env.FFPROBE_TIMEOUT_MS ?? 30_000),
  ) {}

  async inspect(filePath: string) {
    try {
      const { stdout } = await execFileAsync(
        this.ffprobePath,
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_type,codec_name,profile,level,pix_fmt,width,height,r_frame_rate,sample_rate,channels",
          "-show_entries",
          "format=format_name,duration",
          "-of",
          "json",
          filePath,
        ],
        { timeout: this.timeoutMs, maxBuffer: 1024 * 1024 },
      );
      return validateFfprobeOutput(JSON.parse(stdout) as FfprobeOutput);
    } catch (error) {
      if (error instanceof MediaPipelineError) throw error;
      throw new MediaPipelineError(
        "VIDEO_PROCESSING_FAILED",
        "FFprobe 无法解析视频文件。",
        422,
        { cause: error },
      );
    }
  }
}
