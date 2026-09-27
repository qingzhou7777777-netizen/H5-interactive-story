import { PrismaClient } from "@prisma/client";

import { Chapter01StoryMapSeeder } from "../story-map/chapter-01-story-map-seed.js";

const prisma = new PrismaClient();
try {
  const result = await new Chapter01StoryMapSeeder(prisma).seed();
  console.log(JSON.stringify(result));
} finally {
  await prisma.$disconnect();
}
