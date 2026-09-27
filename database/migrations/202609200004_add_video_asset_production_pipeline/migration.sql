ALTER TYPE "VideoStatus" ADD VALUE 'PROCESSING';

ALTER TABLE "video_assets"
ADD COLUMN "video_codec" TEXT,
ADD COLUMN "audio_codec" TEXT,
ADD COLUMN "pixel_format" TEXT,
ADD COLUMN "frame_rate" DOUBLE PRECISION,
ADD COLUMN "processing_error" TEXT,
ADD COLUMN "poster_object_key" TEXT,
ADD COLUMN "poster_mime_type" TEXT,
ADD COLUMN "poster_file_size" BIGINT;

CREATE UNIQUE INDEX "video_assets_poster_object_key_key"
ON "video_assets"("poster_object_key");
