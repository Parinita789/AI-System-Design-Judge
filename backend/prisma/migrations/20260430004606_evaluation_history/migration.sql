-- Allow multiple evaluations per (session, phase). Each Re-evaluate inserts
-- a new row instead of upserting. Drops the old unique constraint and
-- replaces it with an ordered index for fast "latest" lookups.

-- DropIndex (Postgres backs unique constraints with unique indexes)
DROP INDEX IF EXISTS "phase_evaluations_session_id_phase_key";
ALTER TABLE "phase_evaluations" DROP CONSTRAINT IF EXISTS "phase_evaluations_session_id_phase_key";

-- CreateIndex
CREATE INDEX "phase_evaluations_session_id_phase_evaluated_at_idx"
  ON "phase_evaluations"("session_id", "phase", "evaluated_at" DESC);
