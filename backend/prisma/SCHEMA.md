# Schema relationship diagram

Reference for the data model defined in `schema.prisma`. Update this file
when adding/removing tables or changing cardinalities. The diagram below
is the rendered SVG export of the Mermaid source that follows it — keep
the two in sync when you edit the schema.

## ER diagram

![Interview Assistant ER diagram](./schema.svg)

<details>
<summary>Mermaid source (click to expand)</summary>

```mermaid
erDiagram
    Question ||--o{ Session : "Session.question_id → Question.id"
    Session  ||--o{ Snapshot : "Snapshot.session_id → Session.id"
    Session  ||--o{ PhaseEvaluation : "PhaseEvaluation.session_id → Session.id"
    Session  ||--o{ AIInteraction : "AIInteraction.session_id → Session.id"
    Session  ||--o{ BuildEvent : "BuildEvent.session_id → Session.id"
    Session  ||--o{ BuildAIInteraction : "BuildAIInteraction.session_id → Session.id"
    Session  ||--o| FinalArtifacts : "FinalArtifacts.session_id → Session.id (PK+FK)"
    PhaseEvaluation ||--o| EvaluationAudit : "EvaluationAudit.phase_evaluation_id → PhaseEvaluation.id (UNIQUE)"
    PhaseEvaluation ||--o| MentorArtifact : "MentorArtifact.phase_evaluation_id → PhaseEvaluation.id (UNIQUE)"
    PhaseEvaluation ||--o| SignalMentorArtifact : "SignalMentorArtifact.phase_evaluation_id → PhaseEvaluation.id (UNIQUE)"

    Question {
        uuid id PK
        text prompt
        text rubric_version
        enum mode "build|design (NULL on v1.0 questions)"
        timestamp created_at
    }

    Session {
        uuid id PK
        uuid question_id FK
        text project_path
        timestamp started_at
        timestamp ended_at
        enum status "active|completed|abandoned"
        enum seniority "junior|mid|senior|staff (NULL on v1.0)"
        decimal overall_score
        text overall_feedback
        char build_token_hash "bcrypt(secret); never returned by API"
        timestamp build_started_at "set by POST /sessions/:id/start-build"
        timestamp build_ended_at "set by POST /api/build/finish"
        int build_event_count "atomic counter bumped on each event batch"
    }

    Snapshot {
        uuid id PK
        uuid session_id FK
        timestamp taken_at
        int elapsed_minutes
        text inferred_phase
        json artifacts "planMd lives here"
        json judge_note
    }

    PhaseEvaluation {
        uuid id PK
        uuid session_id FK
        enum phase "plan|build|validate|wrap"
        decimal score
        json signal_results
        text feedback_text
        json top_actionable_items
        json gap_topics "[{name, coverage: missed|lightly_touched, why_expected}] from CANONICAL_TOPICS"
        timestamp evaluated_at
    }

    EvaluationAudit {
        uuid id PK
        uuid phase_evaluation_id FK "UNIQUE"
        text prompt "rendered LLM input"
        text raw_response "LLM text pre-parse"
        text model_used
        int tokens_in
        int tokens_out
        int cache_read_tokens
        int cache_creation_tokens
        int latency_ms "wall-clock LLM call duration (NULL for pre-2026-05-04 rows)"
        timestamp created_at
    }

    MentorArtifact {
        uuid id PK
        uuid phase_evaluation_id FK "UNIQUE"
        text content "Markdown — 6-section deep-dive teaching artifact"
        text model_used
        int tokens_in
        int tokens_out
        int cache_read_tokens
        int cache_creation_tokens
        int latency_ms
        timestamp created_at
        timestamp updated_at
    }

    SignalMentorArtifact {
        uuid id PK
        uuid phase_evaluation_id FK "UNIQUE"
        jsonb annotations "{signal_id → coaching string} for gap signals only"
        text model_used
        int tokens_in
        int tokens_out
        int cache_read_tokens
        int cache_creation_tokens
        int latency_ms
        timestamp created_at
        timestamp updated_at
    }

    AIInteraction {
        uuid id PK
        uuid session_id FK
        timestamp occurred_at
        int elapsed_minutes
        text inferred_phase
        text prompt
        text response
        text model_used
        int tokens_in
        int tokens_out
        json artifact_state_at_prompt
    }

    BuildEvent {
        uuid id PK
        uuid session_id FK
        text file_path
        text action "created|modified|deleted"
        text content "first capture (full text); NULL on diff-only events"
        text content_diff "unified patch vs prior content; NULL on first capture"
        timestamp occurred_at
        timestamp received_at
    }

    BuildAIInteraction {
        uuid id PK
        uuid session_id FK
        text tool "claude-code"
        text external_session_id "Claude Code session id"
        int turn_index
        text role "user|assistant|tool"
        text text
        text tool_name
        text tool_input_summary
        text tool_result_summary
        timestamp occurred_at
        timestamp received_at
    }

    FinalArtifacts {
        uuid session_id PK,FK
        text plan_md
        text git_log
        text ai_prompts_log
        text reflection
        json code_files
    }
```

</details>

## Relationships

Each row reads "child.foreign_key → parent.primary_key" — that's the column
linkage Postgres uses to enforce the relationship.

| Edge | Cardinality | Join (child FK → parent PK) | onDelete | Why |
| --- | --- | --- | --- | --- |
| Question → Session | 1 : N | `sessions.question_id` → `questions.id` | `Restrict` | Deleting a question goes through `QuestionsService.deleteQuestion` which `deleteMany`'s the child sessions first (in a single transaction) and then deletes the question — Restrict prevents accidental orphaning if the service is bypassed. |
| Session → Snapshot | 1 : N | `snapshots.session_id` → `sessions.id` | `Cascade` | Snapshots are session-scoped logs. |
| Session → PhaseEvaluation | 1 : N | `phase_evaluations.session_id` → `sessions.id` | `Cascade` | Re-evaluate creates a new row; history retained per session. |
| Session → AIInteraction | 1 : N | `ai_interactions.session_id` → `sessions.id` | `Cascade` | Hint chat log. |
| Session → BuildEvent | 1 : N | `build_events.session_id` → `sessions.id` | `Cascade` | File save events captured by the CLI watcher during the build phase. Each save is a row; `(session_id, occurred_at)` is indexed for the build evaluator's timeline scan. |
| Session → BuildAIInteraction | 1 : N | `build_ai_interactions.session_id` → `sessions.id` | `Cascade` | Per-turn rows from Claude Code conversation logs the CLI tails out of `~/.claude/projects/<encodedCwd>/`. Composite unique `(session_id, external_session_id, turn_index)` lets the CLI re-ship a batch idempotently. |
| Session → FinalArtifacts | 1 : 0..1 | `final_artifacts.session_id` → `sessions.id` (also PK on the child, which enforces 0..1) | `Cascade` | Optional snapshot of the session's final output (one per session). |
| PhaseEvaluation → EvaluationAudit | 1 : 0..1 | `evaluation_audits.phase_evaluation_id` → `phase_evaluations.id` (UNIQUE on child, which enforces 0..1) | `Cascade` | One audit per evaluation. Deleting an evaluation drops its audit. |
| PhaseEvaluation → MentorArtifact | 1 : 0..1 | `mentor_artifacts.phase_evaluation_id` → `phase_evaluations.id` (UNIQUE on child) | `Cascade` | Optional 6-section mentor reflection per evaluation. Phase-aware (Phase 5): fires for plan and build evals. |
| PhaseEvaluation → SignalMentorArtifact | 1 : 0..1 | `signal_mentor_artifacts.phase_evaluation_id` → `phase_evaluations.id` (UNIQUE on child) | `Cascade` | Optional per-signal coaching map — `{signal_id → annotation}` populated only for gap signals (missed-good, fired-bad). Loads the rubric matching the eval's actual phase. |

## Design highlights

- **Question vs Session split**: Question = the problem
  (prompt + rubric version), Session = one attempt. A Question owns N
  attempts; the most recent `plan.md` is copied forward into a new attempt
  via the "Try again" path.
- **EvaluationAudit is a sibling, not a parent**, of `PhaseEvaluation`:
  parsed output (score, signals, feedback) stays lean on the main table;
  the heavy prompt/raw-response text lives only in the audit table. Cascade
  keeps them aligned without bloating the hot path.
- **No upsert on PhaseEvaluation.** Each Re-evaluate inserts a new row.
  The `(session_id, phase, evaluated_at DESC)` index makes "latest plan
  eval for session X" a single seek; nothing is ever overwritten.
- **JSON columns vs relational rows.** `signal_results`, `artifacts`,
  and `gap_topics` are JSON because their shape is rubric-driven /
  vocabulary-driven and varies across versions. Anything queried
  directly (status, scores, foreign keys) is a typed column.
- **Build phase capture is per-row.** A CLI watcher (`mentor watch`)
  ships file saves to `POST /api/build/events` and Claude Code
  conversation turns to `POST /api/build/ai-interactions`. Each save
  is one `BuildEvent`; each turn is one `BuildAIInteraction`. The
  build evaluator reconstructs the final tree from the event log
  (`reconstructBuildTree` applies `created` / `modified` / `deleted`
  in order, falling back gracefully on broken patches), then trims
  to a prompt-shaped slice via `selectBuildContext` (top-N
  highest-churn snippets, recent K AI turns).
- **Token-scoped auth on build endpoints.** `Session.build_token_hash`
  stores `bcrypt(secret)` for the per-session bearer token minted by
  `POST /sessions/:id/start-build`. The token format is
  `<sessionId-uuid>.<32-byte-hex-secret>` so the guard does an O(1)
  session lookup before the bcrypt compare. The hash is stripped from
  every API read path by `SessionsRepository.stripHash`.
- **`gap_topics`** is the structured gap list per phase eval (input to
  the future study feature that will aggregate "you've missed
  caching in 3 of your last 5 sessions" across questions). Frozen
  vocabulary lives in `helpers/canonical-topics.ts`; the LLM picks
  names from there at the tool layer, validators drop out-of-list
  paraphrases with a warn.
- **No `gap_topics` index.** It's read together with the eval row,
  not queried independently — yet. When the study feature lands,
  add a GIN index on `gap_topics` jsonb_path_ops if any cross-session
  query starts scanning.
