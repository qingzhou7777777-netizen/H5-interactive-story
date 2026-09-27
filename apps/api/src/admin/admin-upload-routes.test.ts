import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { AdminVideoAssetDto } from "@interactive-story/api-contracts";

import type { VideoAssetUploadUseCase } from "../media/video-asset-upload-service.js";
import { registerAdminUploadRoutes } from "./admin-upload-routes.js";

const asset: AdminVideoAssetDto = {
  id: "asset-id",
  code: "chapter01-node001",
  originalFilename: "Node001.mp4",
  objectKey: "videos/node001.mp4",
  playbackUrl: "https://media.example/videos/node001.mp4",
  posterUrl: null,
  mimeType: "video/mp4",
  fileSize: "100",
  durationMs: 4000,
  width: 720,
  height: 1280,
  checksum: "checksum",
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
  createdAt: "2026-09-20T08:00:00.000Z",
  updatedAt: "2026-09-20T08:00:00.000Z",
};

function multipartPayload(
  filename: string,
  mimeType: string,
  content: Buffer,
  boundary: string,
) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

async function createApp(service: VideoAssetUploadUseCase) {
  const app = Fastify();
  await app.register(multipart);
  await registerAdminUploadRoutes(app, service);
  return app;
}

describe("Admin upload API", () => {
  it("accepts a multipart MP4 upload", async () => {
    let receivedFilename = "";
    const app = await createApp({
      maxVideoBytes: 1024,
      maxPosterBytes: 1024,
      async uploadVideo(_assetCode, upload) {
        receivedFilename = upload.filename;
        for await (const _chunk of upload.stream) {
          // Consume the multipart stream.
        }
        return asset;
      },
      async uploadPoster() { return asset; },
    });
    const boundary = "codex-video-boundary";
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/video-assets/chapter01-node001/video",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartPayload("Node001.mp4", "video/mp4", Buffer.from("video"), boundary),
    });

    expect(response.statusCode).toBe(200);
    expect(receivedFilename).toBe("Node001.mp4");
    expect(response.json()).toMatchObject({ code: "chapter01-node001", status: "ready" });
    await app.close();
  });

  it("requires a multipart file field", async () => {
    const app = await createApp({
      maxVideoBytes: 1024,
      maxPosterBytes: 1024,
      async uploadVideo() { return asset; },
      async uploadPoster() { return asset; },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/admin/video-assets/chapter01-node001/poster",
      headers: { "content-type": "application/json" },
      payload: {},
    });

    expect(response.statusCode).toBe(406);
    await app.close();
  });
});
