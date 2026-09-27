-- CreateEnum
CREATE TYPE "PrerequisitePurpose" AS ENUM ('DISCOVERY', 'UNLOCK');

-- CreateEnum
CREATE TYPE "PrerequisiteFactType" AS ENUM ('CHAPTER_STARTED', 'NODE_DISCOVERED', 'NODE_COMPLETED', 'CHOICE_SELECTED');

-- CreateEnum
CREATE TYPE "PrerequisiteSourceScope" AS ENUM ('MAINLINE_ONLY', 'EXPLORATION_ONLY', 'ANY');

-- CreateTable
CREATE TABLE "story_map_regions" (
    "id" UUID NOT NULL,
    "chapter_release_id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL,
    "layout_metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_map_regions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "story_map_regions_sort_order_nonnegative" CHECK ("sort_order" >= 0)
);

-- CreateTable
CREATE TABLE "story_map_nodes" (
    "id" UUID NOT NULL,
    "chapter_release_id" UUID NOT NULL,
    "region_id" UUID NOT NULL,
    "node_code" VARCHAR(128) NOT NULL,
    "display_title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "cover_url" VARCHAR(2048),
    "position_x" INTEGER NOT NULL,
    "position_y" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "allow_exploration" BOOLEAN NOT NULL DEFAULT true,
    "allow_replay" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "story_map_nodes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "story_map_nodes_sort_order_nonnegative" CHECK ("sort_order" >= 0)
);

-- CreateTable
CREATE TABLE "node_prerequisites" (
    "id" UUID NOT NULL,
    "story_map_node_id" UUID NOT NULL,
    "purpose" "PrerequisitePurpose" NOT NULL,
    "group_code" VARCHAR(128) NOT NULL,
    "fact_type" "PrerequisiteFactType" NOT NULL,
    "required_node_code" VARCHAR(128),
    "required_choice_code" VARCHAR(128),
    "source_scope" "PrerequisiteSourceScope" NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_prerequisites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "node_prerequisites_sort_order_nonnegative" CHECK ("sort_order" >= 0),
    CONSTRAINT "node_prerequisites_fact_shape" CHECK (
        (
            "fact_type" = 'CHAPTER_STARTED'
            AND "required_node_code" IS NULL
            AND "required_choice_code" IS NULL
            AND "source_scope" = 'MAINLINE_ONLY'
        )
        OR (
            "fact_type" IN ('NODE_DISCOVERED', 'NODE_COMPLETED')
            AND "required_node_code" IS NOT NULL
            AND "required_choice_code" IS NULL
        )
        OR (
            "fact_type" = 'CHOICE_SELECTED'
            AND "required_node_code" IS NOT NULL
            AND "required_choice_code" IS NOT NULL
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "story_map_regions_chapter_release_id_code_key" ON "story_map_regions"("chapter_release_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "story_map_regions_chapter_release_id_sort_order_key" ON "story_map_regions"("chapter_release_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "story_map_regions_id_chapter_release_id_key" ON "story_map_regions"("id", "chapter_release_id");

-- CreateIndex
CREATE INDEX "story_map_nodes_chapter_release_id_region_id_idx" ON "story_map_nodes"("chapter_release_id", "region_id");

-- CreateIndex
CREATE UNIQUE INDEX "story_map_nodes_chapter_release_id_node_code_key" ON "story_map_nodes"("chapter_release_id", "node_code");

-- CreateIndex
CREATE UNIQUE INDEX "story_map_nodes_region_id_sort_order_key" ON "story_map_nodes"("region_id", "sort_order");

-- CreateIndex
CREATE INDEX "node_prerequisites_story_map_node_id_purpose_idx" ON "node_prerequisites"("story_map_node_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "node_prerequisites_story_map_node_id_purpose_group_code_sor_key" ON "node_prerequisites"("story_map_node_id", "purpose", "group_code", "sort_order");

-- AddForeignKey
ALTER TABLE "story_map_regions"
ADD CONSTRAINT "story_map_regions_chapter_release_id_fkey"
FOREIGN KEY ("chapter_release_id") REFERENCES "chapter_releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "story_map_nodes"
ADD CONSTRAINT "story_map_nodes_region_id_chapter_release_id_fkey"
FOREIGN KEY ("region_id", "chapter_release_id") REFERENCES "story_map_regions"("id", "chapter_release_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "node_prerequisites"
ADD CONSTRAINT "node_prerequisites_story_map_node_id_fkey"
FOREIGN KEY ("story_map_node_id") REFERENCES "story_map_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
