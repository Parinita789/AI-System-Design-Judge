-- Rubric variant for a question (v2.0+). Two variants today:
--   build  → small/buildable problems (60-min sessions)
--   design → production-scale design exercises (interview style)
-- Legacy v1.0 questions keep mode = NULL and route through the
-- single-rubric path in RubricLoaderService.

CREATE TYPE "Mode" AS ENUM ('build', 'design');

ALTER TABLE "questions" ADD COLUMN "mode" "Mode";
