import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";

import {
  ObjectStorageError,
  type ObjectStorage,
  type PutObjectInput,
} from "./object-storage.js";

export interface S3ObjectStorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  publicBaseUrl: string;
}

interface S3CommandSender {
  send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  private readonly client: S3CommandSender;

  constructor(
    private readonly options: S3ObjectStorageOptions,
    client?: S3CommandSender,
  ) {
    const config: S3ClientConfig = {
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    };
    this.client = client ?? new S3Client(config);
  }

  async putObject(input: PutObjectInput) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.options.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentLength: input.contentLength,
        }),
      );
    } catch (error) {
      throw new ObjectStorageError("对象存储写入失败。", { cause: error });
    }
  }

  async deleteObject(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }),
      );
    } catch (error) {
      throw new ObjectStorageError("对象存储清理失败。", { cause: error });
    }
  }

  getPublicUrl(key: string) {
    return `${this.options.publicBaseUrl.replace(/\/$/, "")}/${encodeObjectKey(key)}`;
  }
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredProductionValue(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: string,
) {
  const value = env[name]?.trim();
  if (env.NODE_ENV === "production" && !value) {
    throw new Error(`生产环境必须配置 ${name}。`);
  }
  return value || fallback;
}

function requireProductionHttps(value: string, name: string, isProduction: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} 必须是有效 URL。`);
  }
  if (isProduction && url.protocol !== "https:") {
    throw new Error(`生产环境 ${name} 必须使用 HTTPS。`);
  }
  return value;
}

export function readS3ObjectStorageOptions(
  env: NodeJS.ProcessEnv = process.env,
): S3ObjectStorageOptions {
  const isProduction = env.NODE_ENV === "production";
  const endpoint = requiredProductionValue(
    env,
    "OBJECT_STORAGE_ENDPOINT",
    "http://localhost:9000",
  );
  const publicBaseUrl = requiredProductionValue(
    env,
    "OBJECT_STORAGE_PUBLIC_BASE_URL",
    "http://localhost:9000/interactive-story",
  );
  const accessKeyId = requiredProductionValue(
    env,
    "OBJECT_STORAGE_ACCESS_KEY",
    "minioadmin",
  );
  const secretAccessKey = requiredProductionValue(
    env,
    "OBJECT_STORAGE_SECRET_KEY",
    "minioadmin",
  );

  if (
    isProduction &&
    [accessKeyId, secretAccessKey].some((value) =>
      ["minioadmin", "change_me", "changeme"].includes(value.toLowerCase()),
    )
  ) {
    throw new Error("生产环境禁止使用默认或占位对象存储凭据。");
  }

  return {
    endpoint: requireProductionHttps(endpoint, "OBJECT_STORAGE_ENDPOINT", isProduction),
    region: requiredProductionValue(env, "OBJECT_STORAGE_REGION", "us-east-1"),
    bucket: requiredProductionValue(
      env,
      "OBJECT_STORAGE_BUCKET",
      "interactive-story",
    ),
    accessKeyId,
    secretAccessKey,
    forcePathStyle: (env.OBJECT_STORAGE_FORCE_PATH_STYLE ?? "true") === "true",
    publicBaseUrl: requireProductionHttps(
      publicBaseUrl,
      "OBJECT_STORAGE_PUBLIC_BASE_URL",
      isProduction,
    ),
  };
}

export function createS3ObjectStorageFromEnv() {
  return new S3CompatibleObjectStorage(readS3ObjectStorageOptions());
}

export function getVideoUploadMaxBytes() {
  return readPositiveInteger(process.env.VIDEO_UPLOAD_MAX_BYTES, 99_614_720);
}
