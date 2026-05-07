-- Build-phase columns on sessions: token hash + timestamps + event
-- count. The hash stores bcrypt(secret) where `secret` is the second
-- half of the bearer token the CLI presents on every flush. The first
-- half of the token is the session_id (so the guard can resolve which
-- row to compare against without scanning all sessions). Null until
-- the candidate hits "Start build phase" on the web app.

ALTER TABLE "sessions"
  ADD COLUMN "build_token_hash"   TEXT,
  ADD COLUMN "build_started_at"   TIMESTAMP(3),
  ADD COLUMN "build_ended_at"     TIMESTAMP(3),
  ADD COLUMN "build_event_count"  INTEGER NOT NULL DEFAULT 0;

-- One row per captured file save. Either `content` (first capture)
-- or `content_diff` (unified patch vs the prior capture) is populated.
-- Deletes carry neither. The (session_id, occurred_at) index supports
-- the build agent's timeline scan in phase 4.

CREATE TABLE "build_events" (
    "id"            UUID NOT NULL,
    "session_id"    UUID NOT NULL,
    "file_path"     TEXT NOT NULL,
    "action"        TEXT NOT NULL,
    "content"       TEXT,
    "content_diff"  TEXT,
    "occurred_at"   TIMESTAMP(3) NOT NULL,
    "received_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "build_events_session_id_occurred_at_idx"
    ON "build_events"("session_id", "occurred_at");

ALTER TABLE "build_events"
    ADD CONSTRAINT "build_events_session_id_fkey"
    FOREIGN KEY ("session_id")
    REFERENCES "sessions"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;
