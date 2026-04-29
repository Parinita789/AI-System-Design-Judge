# Plan — AI System Design Judge

This document defines *what* is being built and *how*. For *why* behind decisions, see `decisions.md`.

---

## Goal

A personal tool to practice 2-hour AI-assisted system design interview sessions. Captures session artifacts, evaluates each phase against a locked rubric using multi-agent LLMs, stores results in a database, and surfaces feedback in a dashboard with trends and recurring weaknesses.

---

## Scope

### In scope (v1)
- Single-user local web app
- Session lifecycle: start → 5-min snapshot capture → end → multi-agent evaluation → dashboard
- Integration with the user's actual VS Code + Claude Code workflow (read-only observer)
- 4-phase rubric evaluation: plan, build, validate, wrap
- Per-session results page + cross-session dashboard (trends, signal heatmap, recurring weaknesses)
- Postgres storage with JSONB for flexible data shapes

### Out of scope (v1)
- Real-time judge interruptions during the session
- Multi-user / authentication
- Hosted deployment
- Support for AI tools beyond Claude Code
- Rubric editing UI
- Cross-session memory in the evaluation agents

---

## Functional Requirements

1. Start a session by entering an interview prompt and selecting a project directory.
2. Display elapsed-time timer during the active session.
3. Every 5 minutes, capture a snapshot of: plan.md, code file contents, git log, new Claude Code JSONL entries.
4. Allow ending the session manually or auto-end at 2 hours.
5. On end-of-session, run 4 phase agents in parallel + 1 synthesizer agent sequentially.
6. Store evaluation results in Postgres.
7. Display per-session results: scores per phase, signal hit/miss with evidence, top actionable items.
8. Display cross-session dashboard: score trend over time, signal heatmap, recurring weakness summary.

---

## Non-Functional Requirements

### Demo scale (v1, validated against)
- 1 concurrent user
- ~24 snapshots per 2hr session, ~1MB session data total
- End-of-session evaluation completes within 90 seconds
- Up to 50 stored sessions accessible from dashboard

### Target scale (architected for, not built)
- Could be deployed for a small team (~10 users) without architectural changes
- Postgres handles 10K+ sessions before any tuning needed
- Per-user data isolation would need auth + row-level filtering (deferred)

---

## Tool Choices

| Layer | Choice | Reason |
|---|---|---|
| Backend | NestJS (Node.js, TypeScript) | Familiarity, modular structure, scales as features grow |
| Frontend | React + TypeScript | Default choice, well-supported |
| Styling | Tailwind | Fast iteration without CSS files |
| Charts | Recharts | Simple API, good defaults for trends and heatmaps |
| Editor display | Monaco (read-only in dashboard) | High-quality code rendering |
| Database | PostgreSQL | Relational data + JSONB for flexible parts; cascading deletes; SQL aggregations for dashboard |
| LLM | Anthropic Claude API | Matches Claude Code workflow |
| ORM | Prisma or TypeORM | Type-safe DB access in TS |

---

## Architectural Shape and Seams

### Shape
Single backend service (NestJS) + single frontend (React SPA) + single Postgres. Layered modules within the backend: controllers → services → repositories. The tool is an *observer* of the user's project directory and Claude Code log files; it does not host the editor.

### Seams (where future scale would be added without rewriting)

1. **LLM provider seam:** all LLM calls go through `LLMModule`. Swapping providers (Claude → OpenAI → local model) is a one-file change.
2. **Storage seam:** repositories abstract Postgres access. Swapping to a different DB or adding a read replica only touches repository implementations.
3. **Phase tagging seam:** `PhaseTaggerService` is a single class. Replacing artifact-based inference with a different strategy (e.g., explicit markers, ML classifier) is a one-file change.
4. **Agent seam:** phase agents share a common interface. Adding new phases or specializing further is additive, not a rewrite.

---

## Data Model

### Entities

**Session**
- `id` (UUID)
- `prompt` (text — the interview question)
- `rubric_version` (text — e.g. "v1.0")
- `project_path` (text — local directory the tool observes)
- `started_at`, `ended_at` (timestamps)
- `status` (enum: active | completed | abandoned)
- `overall_score` (numeric 1.0-5.0)
- `overall_feedback` (text — synthesizer output)

**Snapshot**
- `id`, `session_id` (FK)
- `taken_at`, `elapsed_minutes`
- `inferred_phase` (text — best guess at capture time)
- `artifacts` (JSONB — `{ plan_md, code_files, git_log, new_jsonl_entries }`)
- `judge_note` (JSONB — optional LLM observation)

**PhaseEvaluation**
- `id`, `session_id` (FK)
- `phase` (enum: plan | build | validate | wrap)
- `score` (numeric 1.0-5.0)
- `signal_results` (JSONB — `{ signal_id: { result, evidence }, ... }`)
- `feedback_text` (text)
- `top_actionable_items` (JSONB)
- `evaluated_at`
- Unique constraint: (session_id, phase)

**AIInteraction**
- `id`, `session_id` (FK)
- `occurred_at`, `elapsed_minutes`
- `inferred_phase`
- `prompt`, `response` (text)
- `model_used`, `tokens_in`, `tokens_out`
- `artifact_state_at_prompt` (JSONB — plan.md + code state at prompt time)

**FinalArtifacts**
- `session_id` (PK, FK)
- `plan_md`, `git_log`, `ai_prompts_log`, `reflection` (text)
- `code_files` (JSONB — `{ filename: content }`)

### Relationships
- Session 1—N Snapshot (cascade delete)
- Session 1—N PhaseEvaluation (cascade delete, one per phase)
- Session 1—N AIInteraction (cascade delete)
- Session 1—1 FinalArtifacts (cascade delete)

### Indexing notes
- `snapshots.session_id` indexed for fast retrieval per session
- `phase_evaluations.signal_results` GIN-indexed for cross-session signal queries
- `ai_interactions.session_id`, `ai_interactions.inferred_phase` indexed for phase-scoped retrieval

---

## Component Boundaries

### Backend Modules (NestJS)

| Module | Responsibility |
|---|---|
| `SessionsModule` | Create, end, list sessions. Owns `Session` lifecycle. |
| `SnapshotsModule` | Capture and store 5-min snapshots. Triggered by frontend tick. |
| `ArtifactsModule` | Read project directory files, git log, Claude Code JSONL. |
| `EvaluationsModule` | Orchestrate phase agents + synthesizer at session end. |
| `LLMModule` | Wrap Anthropic SDK. All LLM calls go through here. |
| `PhaseTaggerModule` | Tag JSONL entries to phases via artifact-based inference. |
| `DashboardModule` | Aggregation queries for trends, heatmaps, recurring weaknesses. |

### Dependency direction
`SessionsModule` → `EvaluationsModule` → `ArtifactsModule`, `PhaseTaggerModule`, `LLMModule`
`SnapshotsModule` → `ArtifactsModule`
`DashboardModule` → repositories only (no service-layer coupling)

No cross-module shortcuts. Higher modules call lower; lower never calls higher.

---

## Key Interfaces

```typescript
// LLMModule
interface LLMService {
  call(prompt: string, opts?: { model?: string; maxTokens?: number }): Promise<LLMResponse>;
}

// ArtifactsModule
interface ArtifactsService {
  gatherSnapshot(projectPath: string, sinceJsonlOffset: number): Promise<SnapshotArtifacts>;
  gatherFinal(projectPath: string): Promise<FinalArtifacts>;
}

// PhaseTaggerModule
interface PhaseTagger {
  tag(jsonlEntries: JsonlEntry[]): TaggedEntries; // { plan: [...], build: [...], ... }
}

// EvaluationsModule
interface PhaseAgent {
  evaluate(phase: Phase, entries: JsonlEntry[], artifacts: FinalArtifacts): Promise<PhaseEvaluation>;
}

interface SynthesizerAgent {
  synthesize(evals: PhaseEvaluation[], artifacts: FinalArtifacts): Promise<Synthesis>;
}

// SessionsModule
interface SessionsService {
  start(prompt: string, projectPath: string): Promise<Session>;
  end(sessionId: string): Promise<{ evaluationId: string }>;
  get(sessionId: string): Promise<SessionWithEvaluations>;
}
```

---

## Failure Modes

### Handled
- **Tab closed mid-session:** localStorage persists session state; on reopen, timer resumes from `started_at`. Missed snapshot intervals are skipped (not retroactively captured).
- **Project directory missing or moved:** snapshot capture fails gracefully with an error logged; session continues.
- **LLM API timeout or error:** phase evaluation retries once, then returns a failure marker; synthesizer is told which phases failed and notes the gap in final feedback.
- **Claude Code JSONL not present:** AI interactions table stays empty for that session; rubric signals dependent on AI prompts are scored "cannot evaluate" rather than missed.
- **Database write failure during evaluation:** transaction rolls back; user can retry end-of-session.

### Punted (out of scope for v1)
- Concurrent sessions for the same project directory
- Disk-full or other infrastructure failures
- LLM provider account exhaustion (rate limits, billing)
- Recovery of partially-completed evaluations after server restart

---

## Build Sequence

1. **Schema + migrations** — Postgres tables, Prisma/TypeORM setup
2. **NestJS scaffolding** — modules, basic DI wiring
3. **Sessions CRUD** — backend + frontend session start page
4. **Artifacts service** — read project directory, parse Claude Code JSONL
5. **Snapshot capture** — client tick → backend snapshot store
6. **Single-phase evaluation end-to-end** — only Plan agent, against locked v1 rubric
7. **Multi-agent fan-out + synthesizer** — add Build, Validate, Wrap agents + synthesizer
8. **Dashboard** — trends chart, heatmap, recurring weaknesses
9. **Polish + iterate** — based on real session usage, refine rubric and UI

Each step is shippable and provides value before the next is built.

---

## Validation Plan

### Per-step validation during build
- Schema: tables created via migration, verified with `psql \d`.
- Sessions CRUD: create + end + retrieve via Postman or curl, verify DB rows.
- Artifacts service: unit test against a fixture project directory and a sample JSONL file.
- Snapshot capture: run a real session for 15 minutes, verify 3 snapshots stored with correct content.
- Single-phase evaluation: feed the locked rubric + a known-bad plan.md (e.g., the one scored earlier), verify the score matches expected (~1) and feedback names the right gaps.
- Multi-agent: same as above but for a session with all 4 phases; verify all 4 phase evaluations stored and synthesizer output is coherent.
- Dashboard: after 3 real sessions, verify trends chart and heatmap render correctly.

### Demo-scale verification
- One full 2-hour session run end-to-end on the actual tool, ending with a session results page that matches what manual evaluation would produce within ±0.5 score points per phase.

---

## AI Usage Plan

### Delegated to AI (Claude Code during build)
- NestJS module scaffolding and boilerplate
- Prisma/TypeORM schema generation from the data model above
- React component scaffolding (forms, tables, charts)
- Test scaffolding
- Tailwind styling iterations

### Written by developer
- Phase tagging logic (artifact-based inference rules)
- LLM prompt construction for phase agents and synthesizer
- The rubric YAML files themselves
- Evaluation orchestration logic in `EvaluationsModule`
- Decisions about which signals fire in edge cases

### Sparring with AI
- Reviewing the rubric prompt structure for edge cases
- Testing whether the judge prompt produces sharp feedback against sample plan.md files

---

## Trade-Offs Accepted

1. **Tool observes vs. tool hosts editor:** chose observer pattern. Trade-off: no real-time UI integration with the editor; gain: real workflow preserved, no learning curve mismatch with real interviews.

2. **Artifact-based phase tagging vs. explicit markers:** chose artifact inference. Trade-off: occasional mislabeling on edge cases; gain: zero user effort, no marker-forgetting failure mode.

3. **Multi-agent vs. single-agent evaluation:** chose multi-agent (4 phase + 1 synthesizer). Trade-off: 5 LLM calls per evaluation instead of 1; gain: parallelism (similar wall-clock), specialization (sharper feedback), independent failure handling.

4. **Postgres + JSONB vs. fully normalized vs. document store:** chose Postgres + JSONB hybrid. Trade-off: cross-session signal queries require GIN-indexed JSONB scans; gain: no schema migrations on rubric changes, foreign keys for data integrity, SQL for dashboards.

5. **Client-side timer vs. server-side scheduling:** chose client-side. Trade-off: snapshots missed if tab is closed >5 min; gain: no websocket/scheduling infrastructure, simpler architecture.

---

## Notes for Future Iterations

- After 5 real sessions, review which rubric signals fire reliably vs. produce noisy feedback. Tune signal definitions or weights accordingly.
- Consider adding per-snapshot LLM notes if the dashboard would benefit from a "session timeline" view.
- Consider rubric forking by problem type (LLM-systems vs. data-pipelines vs. distributed-systems) only after evidence that the universal rubric produces uneven feedback across problem types.