-- Phase 1, commit 1.1: introduce User + nullable userId FKs on
-- Question and Session. Service code (auth, ownership checks,
-- @CurrentUser wiring) lands in commits 1.2 and 1.3. The legacy-import
-- user is inserted now so the 1.3 backfill is a pure UPDATE.

-- Users table
CREATE TABLE "users" (
  "id"            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  "email"         TEXT         NOT NULL UNIQUE,
  "password_hash" TEXT         NOT NULL,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Legacy-import sentinel user. Fixed UUID so the 1.3 backfill is
-- idempotent and easy to grep for. The password_hash is a deliberate
-- non-bcrypt string so no real login can ever resolve to this row.
-- ON CONFLICT guards against re-application (defensive — Prisma's
-- migration tracker should prevent this anyway).
INSERT INTO "users" ("id", "email", "password_hash", "created_at")
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'legacy-import@local',
  '!UNUSED_LEGACY_IMPORT_NO_LOGIN!',
  NOW()
)
ON CONFLICT ("id") DO NOTHING;

-- Question.userId: nullable for now (commit 1.3 will set NOT NULL
-- after backfilling existing rows).
ALTER TABLE "questions"
  ADD COLUMN "user_id" UUID;

ALTER TABLE "questions"
  ADD CONSTRAINT "questions_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "questions_user_id_idx" ON "questions"("user_id");

-- Session.userId: same shape.
ALTER TABLE "sessions"
  ADD COLUMN "user_id" UUID;

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
