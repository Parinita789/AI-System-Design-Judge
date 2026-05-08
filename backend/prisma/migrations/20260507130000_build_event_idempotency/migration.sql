-- Idempotency key + partial unique index on build_events. The CLI
-- supplies a stable hash per event; if a batch is flushed but the
-- ack is lost, the retried batch collapses to the same keys and the
-- partial unique index drops the duplicates. Nullable column so
-- legacy events written pre-migration aren't affected.

ALTER TABLE "build_events" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "build_events_session_idempotency_unique"
  ON "build_events" ("session_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
