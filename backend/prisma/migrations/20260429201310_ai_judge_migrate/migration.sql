-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "Phase" AS ENUM ('plan', 'build', 'validate', 'wrap');

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "rubric_version" TEXT NOT NULL,
    "project_path" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "overall_score" DECIMAL(3,2),
    "overall_feedback" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snapshots" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elapsed_minutes" INTEGER NOT NULL,
    "inferred_phase" TEXT,
    "artifacts" JSONB NOT NULL,
    "judge_note" JSONB,

    CONSTRAINT "snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phase_evaluations" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "phase" "Phase" NOT NULL,
    "score" DECIMAL(3,2) NOT NULL,
    "signal_results" JSONB NOT NULL,
    "feedback_text" TEXT NOT NULL,
    "top_actionable_items" JSONB NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "phase_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_interactions" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "elapsed_minutes" INTEGER NOT NULL,
    "inferred_phase" TEXT,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "artifact_state_at_prompt" JSONB NOT NULL,

    CONSTRAINT "ai_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "final_artifacts" (
    "session_id" UUID NOT NULL,
    "plan_md" TEXT,
    "git_log" TEXT,
    "ai_prompts_log" TEXT,
    "reflection" TEXT,
    "code_files" JSONB NOT NULL,

    CONSTRAINT "final_artifacts_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "snapshots_session_id_idx" ON "snapshots"("session_id");

-- CreateIndex
CREATE INDEX "phase_evaluations_signal_results_idx" ON "phase_evaluations" USING GIN ("signal_results");

-- CreateIndex
CREATE UNIQUE INDEX "phase_evaluations_session_id_phase_key" ON "phase_evaluations"("session_id", "phase");

-- CreateIndex
CREATE INDEX "ai_interactions_session_id_idx" ON "ai_interactions"("session_id");

-- CreateIndex
CREATE INDEX "ai_interactions_inferred_phase_idx" ON "ai_interactions"("inferred_phase");

-- AddForeignKey
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phase_evaluations" ADD CONSTRAINT "phase_evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_interactions" ADD CONSTRAINT "ai_interactions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "final_artifacts" ADD CONSTRAINT "final_artifacts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
