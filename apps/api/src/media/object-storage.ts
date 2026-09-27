import type { Readable } from "node:stream";

export interface PutObjectInput {
  key: string;
  body: Readable;
  contentType: string;
  contentLength: number;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  deleteObject(key: string): Promise<void>;
  getPublicUrl(key: string): string;
}

export class ObjectStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ObjectStorageError";
  }
}
