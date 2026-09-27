import { PrismaClient } from "@prisma/client";

import { ChapterReleasePublisher } from "../account-progress/chapter-release-publisher.js";
import { PrismaStoryContentRepository } from "../story/prisma-story-content-repository.js";

const chapterCode = process.argv[2];
if (!chapterCode) {
  throw new Error("请提供 chapterCode，例如：npm run release:chapter -- chapter-01");
}

const prisma = new PrismaClient();
try {
  const publisher = new ChapterReleasePublisher(
    prisma,
    new PrismaStoryContentRepository(prisma),
  );
  const release = await publisher.publishInitialRelease(chapterCode);
  console.log(
    JSON.stringify({
      chapterCode,
      releaseId: release.id,
      version: release.version,
      status: release.status,
    }),
  );
} finally {
  await prisma.$disconnect();
}
