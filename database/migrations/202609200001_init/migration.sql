-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "StoryNodeType" AS ENUM ('VIDEO', 'ENDING');

-- CreateEnum
CREATE TYPE "CompletionMode" AS ENUM ('CHOICES', 'NEXT', 'END');

-- CreateEnum
CREATE TYPE "AccessMode" AS ENUM ('FREE', 'PAYMENT');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "cover_url" TEXT,
    "description" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "character_id" UUID NOT NULL,
    "entry_node_id" UUID,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_assets" (
    "id" UUID NOT NULL,
    "original_filename" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "playback_path" TEXT,
    "mime_type" TEXT NOT NULL DEFAULT 'video/mp4',
    "file_size" BIGINT,
    "duration_ms" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "checksum" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'UPLOADING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_nodes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "chapter_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "video_asset_id" UUID,
    "node_type" "StoryNodeType" NOT NULL DEFAULT 'VIDEO',
    "completion_mode" "CompletionMode" NOT NULL,
    "next_node_id" UUID,
    "access_mode" "AccessMode" NOT NULL DEFAULT 'FREE',
    "access_key" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_choices" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "source_node_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "target_node_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "story_releases" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "story_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "characters_code_key" ON "characters"("code");

-- CreateIndex
CREATE UNIQUE INDEX "chapters_code_key" ON "chapters"("code");

-- CreateIndex
CREATE INDEX "chapters_character_id_idx" ON "chapters"("character_id");

-- CreateIndex
CREATE UNIQUE INDEX "video_assets_object_key_key" ON "video_assets"("object_key");

-- CreateIndex
CREATE INDEX "story_nodes_video_asset_id_idx" ON "story_nodes"("video_asset_id");

-- CreateIndex
CREATE INDEX "story_nodes_next_node_id_idx" ON "story_nodes"("next_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_nodes_chapter_id_code_key" ON "story_nodes"("chapter_id", "code");

-- CreateIndex
CREATE INDEX "story_choices_target_node_id_idx" ON "story_choices"("target_node_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_choices_source_node_id_code_key" ON "story_choices"("source_node_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "story_choices_source_node_id_sort_order_key" ON "story_choices"("source_node_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "story_releases_version_key" ON "story_releases"("version");

-- CreateIndex
CREATE INDEX "story_releases_is_active_idx" ON "story_releases"("is_active");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_entry_node_id_fkey" FOREIGN KEY ("entry_node_id") REFERENCES "story_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_nodes" ADD CONSTRAINT "story_nodes_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_nodes" ADD CONSTRAINT "story_nodes_video_asset_id_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "video_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_nodes" ADD CONSTRAINT "story_nodes_next_node_id_fkey" FOREIGN KEY ("next_node_id") REFERENCES "story_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_source_node_id_fkey" FOREIGN KEY ("source_node_id") REFERENCES "story_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_choices" ADD CONSTRAINT "story_choices_target_node_id_fkey" FOREIGN KEY ("target_node_id") REFERENCES "story_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_releases" ADD CONSTRAINT "story_releases_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
