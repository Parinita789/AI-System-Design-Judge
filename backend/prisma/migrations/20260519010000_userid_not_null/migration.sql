-- Phase 1, commit 1.3: backfill NULL user_id rows to the legacy-import
-- sentinel, then enforce NOT NULL. After this migration, every Question
-- and Session has an owning user. New rows from auth-aware code paths
-- will carry the real user_id from @CurrentUser(); the legacy user
-- exists only as the historical anchor for pre-auth data.

UPDATE "questions"
SET "user_id" = '00000000-0000-0000-0000-000000000000'
WHERE "user_id" IS NULL;

UPDATE "sessions"
SET "user_id" = '00000000-0000-0000-0000-000000000000'
WHERE "user_id" IS NULL;

ALTER TABLE "questions"
  ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "sessions"
  ALTER COLUMN "user_id" SET NOT NULL;
