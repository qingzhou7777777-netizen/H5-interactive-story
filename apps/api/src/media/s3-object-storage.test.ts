import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  getVideoUploadMaxBytes,
  readS3ObjectStorageOptions,
  S3CompatibleObjectStorage,
} from "./s3-object-storage.js";

describe("S3CompatibleObjectStorage", () => {
  it("writes objects and builds an encoded public URL", async () => {
    const send = vi.fn(async () => ({}));
    const storage = new S3CompatibleObjectStorage(
      {
        endpoint: "http://localhost:9000",
        region: "us-east-1",
        bucket: "interactive-story",
        accessKeyId: "test",
        secretAccessKey: "test",
        forcePathStyle: true,
        publicBaseUrl: "https://media.example/interactive-story/",
      },
      { send },
    );

    await storage.putObject({
      key: "videos/chapter 01/Node001.mp4",
      body: Readable.from(Buffer.from("video")),
      contentType: "video/mp4",
      contentLength: 5,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(storage.getPublicUrl("videos/chapter 01/Node001.mp4")).toBe(
      "https://media.example/interactive-story/videos/chapter%2001/Node001.mp4",
    );
  });

  it("requires HTTPS and non-default credentials in production", () => {
    expect(() =>
      readS3ObjectStorageOptions({
        NODE_ENV: "production",
        OBJECT_STORAGE_ENDPOINT: "http://storage.example.com",
        OBJECT_STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
        OBJECT_STORAGE_BUCKET: "story-media",
        OBJECT_STORAGE_ACCESS_KEY: "access",
        OBJECT_STORAGE_SECRET_KEY: "secret",
      }),
    ).toThrow("OBJECT_STORAGE_ENDPOINT 必须使用 HTTPS");

    expect(() =>
      readS3ObjectStorageOptions({
        NODE_ENV: "production",
        OBJECT_STORAGE_ENDPOINT: "https://storage.example.com",
        OBJECT_STORAGE_PUBLIC_BASE_URL: "https://media.example.com",
        OBJECT_STORAGE_BUCKET: "story-media",
        OBJECT_STORAGE_ACCESS_KEY: "minioadmin",
        OBJECT_STORAGE_SECRET_KEY: "minioadmin",
      }),
    ).toThrow("禁止使用默认或占位对象存储凭据");
  });

  it("uses the 95 MiB first-release upload ceiling by default", () => {
    const previous = process.env.VIDEO_UPLOAD_MAX_BYTES;
    delete process.env.VIDEO_UPLOAD_MAX_BYTES;
    try {
      expect(getVideoUploadMaxBytes()).toBe(99_614_720);
    } finally {
      if (previous === undefined) delete process.env.VIDEO_UPLOAD_MAX_BYTES;
      else process.env.VIDEO_UPLOAD_MAX_BYTES = previous;
    }
  });
});
