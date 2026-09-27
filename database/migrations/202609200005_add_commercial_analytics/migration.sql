CREATE TYPE "AnalyticsEventType" AS ENUM (
  'NODE_ENTERED',
  'VIDEO_COMPLETED',
  'CHOICE_SELECTED',
  'ENDING_COMPLETED',
  'PAYMENT_CLICKED'
);

CREATE TABLE "analytics_sessions" (
  "id" UUID NOT NULL,
  "session_key" UUID NOT NULL,
  "first_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "duration_ms" INTEGER NOT NULL DEFAULT 0,
  "landing_path" VARCHAR(2048) NOT NULL,
  "referrer" VARCHAR(2048),
  "utm_source" VARCHAR(255),
  "utm_medium" VARCHAR(255),
  "utm_campaign" VARCHAR(255),
  "utm_content" VARCHAR(255),
  "utm_term" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "analytics_events" (
  "id" UUID NOT NULL,
  "event_id" UUID NOT NULL,
  "event_key" VARCHAR(255) NOT NULL,
  "session_id" UUID NOT NULL,
  "event_type" "AnalyticsEventType" NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "chapter_code" VARCHAR(128),
  "node_code" VARCHAR(128),
  "choice_code" VARCHAR(128),
  "target_node_code" VARCHAR(128),
  "ending_code" VARCHAR(128),
  "offer_code" VARCHAR(128),
  "price_minor" INTEGER,
  "currency" VARCHAR(3),
  "metadata" JSONB,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "test_payment_offers" (
  "id" UUID NOT NULL,
  "code" VARCHAR(128) NOT NULL,
  "chapter_id" UUID NOT NULL,
  "trigger_node_id" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "button_label" VARCHAR(255) NOT NULL,
  "price_minor" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'CNY',
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "test_payment_offers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_sessions_session_key_key" ON "analytics_sessions"("session_key");
CREATE INDEX "analytics_sessions_first_entered_at_idx" ON "analytics_sessions"("first_entered_at");
CREATE INDEX "analytics_sessions_utm_source_idx" ON "analytics_sessions"("utm_source");
CREATE UNIQUE INDEX "analytics_events_event_id_key" ON "analytics_events"("event_id");
CREATE UNIQUE INDEX "analytics_events_session_id_event_key_key" ON "analytics_events"("session_id", "event_key");
CREATE INDEX "analytics_events_event_type_occurred_at_idx" ON "analytics_events"("event_type", "occurred_at");
CREATE INDEX "analytics_events_chapter_code_node_code_idx" ON "analytics_events"("chapter_code", "node_code");
CREATE INDEX "analytics_events_session_id_occurred_at_idx" ON "analytics_events"("session_id", "occurred_at");
CREATE UNIQUE INDEX "test_payment_offers_code_key" ON "test_payment_offers"("code");
CREATE UNIQUE INDEX "test_payment_offers_trigger_node_id_key" ON "test_payment_offers"("trigger_node_id");
CREATE INDEX "test_payment_offers_chapter_id_status_idx" ON "test_payment_offers"("chapter_id", "status");

ALTER TABLE "analytics_events"
ADD CONSTRAINT "analytics_events_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "analytics_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_payment_offers"
ADD CONSTRAINT "test_payment_offers_chapter_id_fkey"
FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "test_payment_offers"
ADD CONSTRAINT "test_payment_offers_trigger_node_id_fkey"
FOREIGN KEY ("trigger_node_id") REFERENCES "story_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
