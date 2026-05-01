-- Per-attempt seniority calibration. The same question can be retried
-- at a different level, so seniority lives on Session (the attempt),
-- not Question.

CREATE TYPE "Seniority" AS ENUM ('junior', 'mid', 'senior', 'staff');

ALTER TABLE "sessions" ADD COLUMN "seniority" "Seniority";
