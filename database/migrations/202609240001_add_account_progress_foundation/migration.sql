-- CreateEnum
CREATE TYPE "EndUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ChapterReleaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserChapterProgressStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "auth_issuer" VARCHAR(512) NOT NULL,
    "auth_subject" VARCHAR(512) NOT NULL,
    "email" VARCHAR(320),
    "status" "EndUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_releases" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ChapterReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshot_json" JSONB NOT NULL,
    "content_hash" CHAR(64) NOT NULL,
    "published_by_id" UUID,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chapter_releases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chapter_releases_version_positive" CHECK ("version" > 0)
);

-- CreateTable
CREATE TABLE "user_chapter_progress" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "chapter_release_id" UUID NOT NULL,
    "status" "UserChapterProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "current_node_code" VARCHAR(128) NOT NULL,
    "canonical_snapshot_json" JSONB NOT NULL,
    "progress_version" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_chapter_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_chapter_progress_version_nonnegative" CHECK ("progress_version" >= 0)
);

-- CreateTable
CREATE TABLE "user_node_progress" (
    "id" UUID NOT NULL,
    "chapter_progress_id" UUID NOT NULL,
    "node_code" VARCHAR(128) NOT NULL,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "available_at" TIMESTAMP(3),
    "first_started_at" TIMESTAMP(3),
    "first_completed_at" TIMESTAMP(3),
    "last_completed_at" TIMESTAMP(3),
    "completion_count" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(3),
    "completion_request_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_node_progress_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_node_progress_completion_count_nonnegative" CHECK ("completion_count" >= 0)
);

-- CreateTable
CREATE TABLE "user_choice_decisions" (
    "id" UUID NOT NULL,
    "chapter_progress_id" UUID NOT NULL,
    "source_node_code" VARCHAR(128) NOT NULL,
    "choice_code" VARCHAR(128) NOT NULL,
    "target_node_code" VARCHAR(128) NOT NULL,
    "request_key" UUID NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_choice_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_issuer_auth_subject_key" ON "users"("auth_issuer", "auth_subject");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_releases_chapter_id_version_key" ON "chapter_releases"("chapter_id", "version");

-- CreateIndex
CREATE INDEX "chapter_releases_chapter_id_status_idx" ON "chapter_releases"("chapter_id", "status");

-- CreateIndex
CREATE INDEX "chapter_releases_published_by_id_idx" ON "chapter_releases"("published_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_releases_one_active_per_chapter_key"
ON "chapter_releases"("chapter_id")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "user_chapter_progress_user_id_chapter_release_id_key" ON "user_chapter_progress"("user_id", "chapter_release_id");

-- CreateIndex
CREATE INDEX "user_chapter_progress_user_id_status_idx" ON "user_chapter_progress"("user_id", "status");

-- CreateIndex
CREATE INDEX "user_chapter_progress_chapter_release_id_idx" ON "user_chapter_progress"("chapter_release_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_node_progress_completion_request_key_key" ON "user_node_progress"("completion_request_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_node_progress_chapter_progress_id_node_code_key" ON "user_node_progress"("chapter_progress_id", "node_code");

-- CreateIndex
CREATE UNIQUE INDEX "user_choice_decisions_request_key_key" ON "user_choice_decisions"("request_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_choice_decisions_chapter_progress_id_source_node_code_key" ON "user_choice_decisions"("chapter_progress_id", "source_node_code");

-- CreateIndex
CREATE INDEX "user_choice_decisions_chapter_progress_id_selected_at_idx" ON "user_choice_decisions"("chapter_progress_id", "selected_at");

-- AddForeignKey
ALTER TABLE "chapter_releases"
ADD CONSTRAINT "chapter_releases_chapter_id_fkey"
FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_releases"
ADD CONSTRAINT "chapter_releases_published_by_id_fkey"
FOREIGN KEY ("published_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_chapter_progress"
ADD CONSTRAINT "user_chapter_progress_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_chapter_progress"
ADD CONSTRAINT "user_chapter_progress_chapter_release_id_fkey"
FOREIGN KEY ("chapter_release_id") REFERENCES "chapter_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_node_progress"
ADD CONSTRAINT "user_node_progress_chapter_progress_id_fkey"
FOREIGN KEY ("chapter_progress_id") REFERENCES "user_chapter_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_choice_decisions"
ADD CONSTRAINT "user_choice_decisions_chapter_progress_id_fkey"
FOREIGN KEY ("chapter_progress_id") REFERENCES "user_chapter_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
