-- CreateTable
CREATE TABLE "stories" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

-- Backfill one story so existing chapters can receive the required relation.
INSERT INTO "stories" (
    "id",
    "code",
    "title",
    "description",
    "status",
    "created_at",
    "updated_at"
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'ai-romance-demo',
    'AI 恋爱互动剧情',
    '由迁移创建的默认故事。',
    'DRAFT',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- AlterTable
ALTER TABLE "chapters" ADD COLUMN "story_id" UUID;
UPDATE "chapters"
SET "story_id" = '00000000-0000-4000-8000-000000000001'
WHERE "story_id" IS NULL;
ALTER TABLE "chapters" ALTER COLUMN "story_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "video_assets" ADD COLUMN "code" TEXT;
ALTER TABLE "video_assets" ADD COLUMN "poster_path" TEXT;
UPDATE "video_assets"
SET "code" = 'legacy-' || "id"::text
WHERE "code" IS NULL;
ALTER TABLE "video_assets" ALTER COLUMN "code" SET NOT NULL;

-- AlterTable
ALTER TABLE "story_nodes" ADD COLUMN "message" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stories_code_key" ON "stories"("code");
CREATE INDEX "chapters_story_id_idx" ON "chapters"("story_id");
CREATE UNIQUE INDEX "video_assets_code_key" ON "video_assets"("code");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_story_id_fkey"
FOREIGN KEY ("story_id") REFERENCES "stories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
