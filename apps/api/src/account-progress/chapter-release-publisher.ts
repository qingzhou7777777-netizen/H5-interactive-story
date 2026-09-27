import { createHash } from "node:crypto";

import {
  ChapterReleaseStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";

import type { StoryContentRepository } from "../story/story-content-repository.js";
import { adaptChapterToRuntime } from "./chapter-runtime-adapter.js";

export class ChapterReleasePublisher {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stories: StoryContentRepository,
  ) {}

  async publishInitialRelease(chapterCode: string) {
    const existing = await this.prisma.chapterRelease.findFirst({
      where: {
        chapter: { code: chapterCode },
        status: ChapterReleaseStatus.ACTIVE,
      },
    });
    if (existing) return existing;

    const chapter = await this.stories.getChapter(chapterCode);
    if (!chapter) {
      throw new Error(`章节 ${chapterCode} 不存在或未激活。`);
    }
    const runtimeStory = adaptChapterToRuntime(chapter);
    const snapshot = { schemaVersion: 1, chapter, runtimeStory } as const;
    const serialized = JSON.stringify(snapshot);
    const contentHash = createHash("sha256").update(serialized).digest("hex");

    return this.prisma.$transaction(async (transaction) => {
      const active = await transaction.chapterRelease.findFirst({
        where: {
          chapter: { code: chapterCode },
          status: ChapterReleaseStatus.ACTIVE,
        },
      });
      if (active) return active;

      const chapterRecord = await transaction.chapter.findUnique({
        where: { code: chapterCode },
        select: { id: true },
      });
      if (!chapterRecord) {
        throw new Error(`章节 ${chapterCode} 不存在。`);
      }
      const latest = await transaction.chapterRelease.aggregate({
        where: { chapterId: chapterRecord.id },
        _max: { version: true },
      });
      return transaction.chapterRelease.create({
        data: {
          chapterId: chapterRecord.id,
          version: (latest._max.version ?? 0) + 1,
          status: ChapterReleaseStatus.ACTIVE,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          contentHash,
          publishedAt: new Date(),
        },
      });
    });
  }
}
