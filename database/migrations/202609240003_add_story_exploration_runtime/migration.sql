-- CreateEnum
CREATE TYPE "UserExplorationRunMode" AS ENUM ('EXPLORATION', 'REPLAY');

-- CreateEnum
CREATE TYPE "UserExplorationRunStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "user_exploration_runs" (
    "id" UUID NOT NULL,
    "chapter_progress_id" UUID NOT NULL,
    "mode" "UserExplorationRunMode" NOT NULL,
    "status" "UserExplorationRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "entry_node_code" VARCHAR(128) NOT NULL,
    "current_node_code" VARCHAR(128) NOT NULL,
    "canonical_snapshot_json" JSONB NOT NULL,
    "run_version" INTEGER NOT NULL DEFAULT 0,
    "start_request_key" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_played_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "abandoned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_exploration_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_exploration_runs_version_nonnegative" CHECK ("run_version" >= 0),
    CONSTRAINT "user_exploration_runs_terminal_state" CHECK (
        (
            "status" = 'ACTIVE'
            AND "completed_at" IS NULL
            AND "abandoned_at" IS NULL
        )
        OR (
            "status" = 'COMPLETED'
            AND "completed_at" IS NOT NULL
            AND "abandoned_at" IS NULL
        )
        OR (
            "status" = 'ABANDONED'
            AND "completed_at" IS NULL
            AND "abandoned_at" IS NOT NULL
        )
    ),
    CONSTRAINT "user_exploration_runs_completed_at_valid" CHECK ("completed_at" IS NULL OR "completed_at" >= "started_at"),
    CONSTRAINT "user_exploration_runs_abandoned_at_valid" CHECK ("abandoned_at" IS NULL OR "abandoned_at" >= "started_at")
);

-- CreateTable
CREATE TABLE "user_node_play_sessions" (
    "id" UUID NOT NULL,
    "exploration_run_id" UUID NOT NULL,
    "node_code" VARCHAR(128) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "completion_request_key" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_node_play_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_node_play_sessions_sequence_positive" CHECK ("sequence" > 0),
    CONSTRAINT "user_node_play_sessions_completed_at_valid" CHECK ("completed_at" IS NULL OR "completed_at" >= "entered_at")
);

-- CreateTable
CREATE TABLE "user_exploration_choice_decisions" (
    "id" UUID NOT NULL,
    "exploration_run_id" UUID NOT NULL,
    "source_play_session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "source_node_code" VARCHAR(128) NOT NULL,
    "choice_code" VARCHAR(128) NOT NULL,
    "target_node_code" VARCHAR(128) NOT NULL,
    "request_key" UUID NOT NULL,
    "selected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_exploration_choice_decisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_exploration_choice_decisions_sequence_positive" CHECK ("sequence" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "user_exploration_runs_start_request_key_key" ON "user_exploration_runs"("start_request_key");

-- CreateIndex
CREATE INDEX "user_exploration_runs_chapter_progress_id_status_idx" ON "user_exploration_runs"("chapter_progress_id", "status");

-- CreateIndex
CREATE INDEX "user_exploration_runs_chapter_progress_id_mode_started_at_idx" ON "user_exploration_runs"("chapter_progress_id", "mode", "started_at");

-- CreateIndex: one active exploration or replay run per chapter progress.
CREATE UNIQUE INDEX "user_exploration_runs_one_active_per_progress_key"
ON "user_exploration_runs"("chapter_progress_id")
WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE UNIQUE INDEX "user_node_play_sessions_completion_request_key_key" ON "user_node_play_sessions"("completion_request_key");

-- CreateIndex
CREATE INDEX "user_node_play_sessions_exploration_run_id_node_code_comple_idx" ON "user_node_play_sessions"("exploration_run_id", "node_code", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_node_play_sessions_exploration_run_id_sequence_key" ON "user_node_play_sessions"("exploration_run_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "user_node_play_sessions_id_exploration_run_id_key" ON "user_node_play_sessions"("id", "exploration_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_exploration_choice_decisions_request_key_key" ON "user_exploration_choice_decisions"("request_key");

-- CreateIndex
CREATE INDEX "user_exploration_choice_decisions_exploration_run_id_select_idx" ON "user_exploration_choice_decisions"("exploration_run_id", "selected_at");

-- CreateIndex
CREATE UNIQUE INDEX "user_exploration_choice_decisions_source_play_session_id_ex_key" ON "user_exploration_choice_decisions"("source_play_session_id", "exploration_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_exploration_choice_decisions_exploration_run_id_sequen_key" ON "user_exploration_choice_decisions"("exploration_run_id", "sequence");

-- AddForeignKey
ALTER TABLE "user_exploration_runs"
ADD CONSTRAINT "user_exploration_runs_chapter_progress_id_fkey"
FOREIGN KEY ("chapter_progress_id") REFERENCES "user_chapter_progress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_node_play_sessions"
ADD CONSTRAINT "user_node_play_sessions_exploration_run_id_fkey"
FOREIGN KEY ("exploration_run_id") REFERENCES "user_exploration_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_exploration_choice_decisions"
ADD CONSTRAINT "user_exploration_choice_decisions_source_play_session_id_e_fkey"
FOREIGN KEY ("source_play_session_id", "exploration_run_id") REFERENCES "user_node_play_sessions"("id", "exploration_run_id") ON DELETE CASCADE ON UPDATE CASCADE;
