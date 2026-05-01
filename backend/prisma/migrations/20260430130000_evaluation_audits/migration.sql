-- Audit trail for the LLM evaluator. One row per PhaseEvaluation, capturing
-- the rendered prompt that was sent to the LLM and the raw response text
-- before JSON parsing. Mirrors the AIInteraction pattern used for hint chats
-- but ties to a specific PhaseEvaluation rather than a session, so reading
-- "the audit for evaluation X" is a single index seek.

CREATE TABLE "evaluation_audits" (
    "id" UUID NOT NULL,
    "phase_evaluation_id" UUID NOT NULL,
    "prompt" TEXT NOT NULL,
    "raw_response" TEXT NOT NULL,
    "model_used" TEXT NOT NULL,
    "tokens_in" INTEGER NOT NULL,
    "tokens_out" INTEGER NOT NULL,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_creation_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_audits_phase_evaluation_id_key" ON "evaluation_audits"("phase_evaluation_id");

ALTER TABLE "evaluation_audits"
    ADD CONSTRAINT "evaluation_audits_phase_evaluation_id_fkey"
    FOREIGN KEY ("phase_evaluation_id")
    REFERENCES "phase_evaluations"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
