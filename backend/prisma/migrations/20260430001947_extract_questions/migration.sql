-- Hoist question-level fields (prompt, rubric_version) out of `sessions`
-- into a new `questions` table. Each session now FKs to a Question.
-- Existing parent_session_id "lineage trees" become one Question whose
-- sessions[] contains every attempt in the tree.

-- 1. Create the new questions table.
CREATE TABLE "questions" (
  "id" UUID NOT NULL,
  "prompt" TEXT NOT NULL,
  "rubric_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- 2. Backfill: one Question per "lineage root" session (parent_session_id IS NULL).
-- Use a temp table to remember which Question ID was assigned to which root,
-- so we can backfill children below without ambiguity.
CREATE TEMP TABLE "questions_to_create" AS
SELECT
  s.id            AS root_session_id,
  gen_random_uuid() AS question_id,
  s.prompt        AS prompt,
  s.rubric_version AS rubric_version,
  s.started_at    AS created_at
FROM "sessions" s
WHERE s.parent_session_id IS NULL;

INSERT INTO "questions" ("id", "prompt", "rubric_version", "created_at")
SELECT question_id, prompt, rubric_version, created_at FROM "questions_to_create";

-- 3. Add the question_id column on sessions (nullable for now; we backfill, then SET NOT NULL).
ALTER TABLE "sessions" ADD COLUMN "question_id" UUID;

-- 4. Backfill sessions.question_id by walking parent_session_id up to the root,
--    then matching that root to the Question we just created.
WITH RECURSIVE session_roots AS (
  -- Base: each session points to itself if it's a root.
  SELECT id, id AS root_id FROM "sessions" WHERE parent_session_id IS NULL
  UNION ALL
  -- Step: each child inherits its parent's root.
  SELECT s.id, sr.root_id
  FROM "sessions" s
  JOIN session_roots sr ON s.parent_session_id = sr.id
)
UPDATE "sessions" sess
SET question_id = qtc.question_id
FROM session_roots sr
JOIN "questions_to_create" qtc ON qtc.root_session_id = sr.root_id
WHERE sess.id = sr.id;

-- 5. Lock down: every session must have a question_id.
ALTER TABLE "sessions" ALTER COLUMN "question_id" SET NOT NULL;

-- 6. Add the FK + index.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_question_id_fkey"
  FOREIGN KEY ("question_id") REFERENCES "questions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "sessions_question_id_idx" ON "sessions"("question_id");

-- 7. Drop the now-redundant parent_session_id self-relation + denormalized columns.
ALTER TABLE "sessions" DROP CONSTRAINT IF EXISTS "sessions_parent_session_id_fkey";
DROP INDEX IF EXISTS "sessions_parent_session_id_idx";
ALTER TABLE "sessions" DROP COLUMN "parent_session_id";
ALTER TABLE "sessions" DROP COLUMN "prompt";
ALTER TABLE "sessions" DROP COLUMN "rubric_version";
