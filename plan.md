# Plan — Interview Assistant

This document defines *what* is built and *how*. For *why* behind decisions, see `decisions.md`.

---

## Goal

A personal tool to practice 1-hour AI-assisted system-design interview sessions. The user picks a question, writes `plan.md` in an in-tool Monaco editor (with optional Socratic-coach hint chat), then ends the session to get a structured evaluation: per-signal verdicts, deterministic score, written feedback, and concrete next actions. Same question can be retried at a different seniority level.

---

## Scope

### In scope
- Single-user local web app
- Question + attempt lifecycle: create question → write `plan.md` (autosaved) → end session → plan-phase evaluation → results page → optional retry
- Forced tool-call output, evidence validation, and deterministic scoring as hallucination guardrails
- v2.0 rubric with build/design variants and per-attempt seniority calibration (Junior / Mid / Senior / Staff)
- LLM provider abstraction over Anthropic API, Ollama, and the Claude Code CLI
- Per-evaluation audit trail (full prompt + raw response, lazy-loaded into a results-page modal)
- In-tool Socratic-coach hint chat that replies grounded in the current `plan.md`
- Eval harness (regression suite of fixtures with expected score ranges and per-signal expectations)
- Postgres storage with JSONB for variable-shape data

### Out of scope (v1)
- Real-time judge interruptions during the session (the hint chat is a coach, not the judge)
- Build / Validate / Wrap phase agents in production (DI scaffolding exists; only PlanAgent runs today)
- Multi-user / authentication
- Hosted deployment
- Rubric editing UI
- Cross-session memory in the evaluation agents
- Claude Code JSONL parsing (`phase-tagger/` is a stub kept for future revisit)

---

## Functional Requirements

1. Create a question + first attempt by entering a prompt; backend infers `mode` (build / design) and stores the attempt with the user-picked seniority (default `senior`).
2. Show a Monaco editor for `plan.md` during the active session, with autosave every 5 min and on tab-close (`sendBeacon`).
3. Show elapsed-time timer with pause/resume; freeze on End/Cancel.
4. Show a Socratic-coach hint chat panel beside the editor; chat turns persist as `AIInteraction` rows.
5. Allow ending the session manually (no auto-end). On end, run the plan-phase evaluator synchronously.
6. Plan-phase evaluator:
   - Loads the rubric, mode-resolved variant, and seniority-resolved per-signal weights.
   - Forces an Anthropic tool call (`submit_evaluation`) with `temperature: 0` so signal IDs and shape are guaranteed.
   - Validates evidence groundedness; downgrades any HIT/PARTIAL whose quote isn't in `plan.md` + hint history.
   - Computes the score deterministically from the (post-validator) signals; the LLM's score is logged but discarded.
   - Persists a 1:1 audit row with the full prompt, tool schema, and raw response.
7. Results page shows: deterministic score with verdict label (Failed / Average / Good / Great), per-signal grouped bar chart with polarity-coded colors, per-polarity coverage pies, audit modal, attempts dropdown, and a `Try again` split-button with a "Retry as: [Junior][Mid][Senior][Staff]" picker.
8. Re-evaluate any past attempt with a different model picker (Haiku / Sonnet / Opus) — generates a new `PhaseEvaluation` + `EvaluationAudit` row.

---

## Non-Functional Requirements

### Demo scale (validated against)
- 1 concurrent user
- ~12 snapshots per 1hr session, ~500KB session data total
- End-of-session evaluation completes within ~10s on Anthropic with caching
- Up to 50 stored sessions accessible from the results / attempts views

### Target scale (architected for, not built)
- Could be deployed for a small team (~10 users) without architectural changes
- Postgres handles 10K+ sessions before any tuning needed
- Per-user data isolation would need auth + row-level filtering (deferred)

---

## Tool Choices

| Layer | Choice | Reason |
|---|---|---|
| Backend | NestJS 10 + TypeScript | Modular DI, scales as features grow |
| Frontend | React 18 + TypeScript + Vite | Default choice, fast HMR |
| Styling | Tailwind | Inline utility classes, no CSS file management |
| Charts | Recharts | Simple API for grouped bars + polarity pies |
| Editor | Monaco (write-mode in active session, read-only in audit modal) | High-quality rendering for both editing and prompt review |
| Database | PostgreSQL | Relational + JSONB for `signal_results` / artifacts; cascading deletes |
| ORM | Prisma | Type-safe, hand-written migrations for schema control |
| LLM (production) | Anthropic SDK (`@anthropic-ai/sdk`) | Tool-use forcing + prompt caching |
| LLM (alt 1) | Ollama (local, no API key) | Dev workflow without burning Anthropic credits |
| LLM (alt 2) | Claude Code CLI (`claude -p`) | Uses the user's logged-in Claude session |

---

## Architectural Shape and Seams

### Shape
Single backend service (NestJS) + single frontend (React SPA, Vite-built) + single Postgres. Layered modules within the backend: controllers → services → repositories. Each module follows the same per-folder layout: `dto/` (request shapes) + `types/` (pure TS) + `prompts/` + `validators/` + `agents/` + `services/` + `helpers/` + `repositories/` + `handlers/`.

The tool **hosts** the editor and an in-tool hint chat (pivoted from the original observer model). The LLM is reached via a provider factory; the factory is the only file that knows about specific providers.

### Seams

1. **LLM provider seam:** all calls go through `LlmService` → `LlmProviderFactory.get()` → one of three `LlmProvider` implementations. Adding/swapping providers is a one-file change.
2. **Storage seam:** repositories abstract Prisma access. Swapping DBs or adding a read replica only touches repository implementations.
3. **Rubric seam:** `RubricLoaderService.load(version, phase, mode, seniority)` reads YAML and returns a normalized `Rubric`. Rubric edits are pure data changes; no code edits unless adding a new field.
4. **Phase agent seam:** `BasePhaseAgent` defines `evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult>`. Adding `BuildAgent` etc. is implementing one method against a fixed contract.
5. **Evaluator output seam:** `parseEvalOutput(text)` and `validateEvalToolArgs(args, expectedIds)` both produce `ParsedEvalOutput`. The plan agent picks the right one based on `response.toolUse`. Adding a new structured-output mechanism (e.g. OpenAI strict mode) is one validator file.

---

## Data Model

### Entities

**Question** — the practice prompt; owns N `Session` attempts.
- `id` (UUID)
- `prompt` (text)
- `rubric_version` (text — frozen at creation, e.g. `"v2.0"`)
- `mode` (enum `build | design | NULL`; NULL on v1.0)
- `created_at`

**Session** — one attempt at a question.
- `id`, `question_id` (FK)
- `seniority` (enum `junior | mid | senior | staff | NULL`; NULL on v1.0)
- `started_at`, `ended_at` (timestamps)
- `status` (enum: `active | completed | abandoned`)
- `overall_score`, `overall_feedback` (denormalized synthesizer outputs; not populated until build/validate/wrap come online)

**Snapshot** — time-series during the session.
- `id`, `session_id` (FK)
- `taken_at`, `elapsed_minutes`
- `artifacts` (JSONB — `{ planMd: string }` today; codebase-ready for `code_files` etc.)

**PhaseEvaluation** — one row per phase agent run; today only `phase = 'plan'` is populated.
- `id`, `session_id` (FK)
- `phase` (enum: `plan | build | validate | wrap`)
- `score` (numeric 1.0–5.0; deterministic, not LLM-emitted)
- `signal_results` (JSONB — `{ [signalId]: { result, evidence, reasoning? } }`)
- `feedback_text`, `top_actionable_items` (JSONB array)
- `evaluated_at`
- *No* unique constraint on `(session_id, phase)` — re-evaluations create new rows so history is preserved.

**EvaluationAudit** — 1:1 with each `PhaseEvaluation`.
- `id`, `phase_evaluation_id` (FK, unique)
- `prompt` (text — full rendered system blocks + user message + tool schema)
- `raw_response` (text — for tool-use path: `JSON.stringify(toolUse.input)`; for fallback: raw text)
- `model_used`, `tokens_in`, `tokens_out`, `cache_read_tokens`, `cache_creation_tokens`
- `created_at`

**AIInteraction** — in-tool hint chat turns.
- `id`, `session_id` (FK)
- `occurred_at`, `elapsed_minutes`
- `inferred_phase` (currently always `'plan'`; reserved for future)
- `prompt`, `response` (text)
- `model_used`, `tokens_in`, `tokens_out`
- `artifact_state_at_prompt` (JSONB — `{ planMd }` snapshot at the time of the prompt)

**FinalArtifacts** — final state at session end (stub, not populated by current paths).
- `session_id` (PK, FK)
- `plan_md`, `code_files`, `git_log`, `ai_prompts_log`, `reflection`

### Relationships
- Question 1 — N Session (cascade delete)
- Session 1 — N Snapshot (cascade delete)
- Session 1 — N PhaseEvaluation (cascade delete; multiple per phase as re-evaluations stack up)
- PhaseEvaluation 1 — 1 EvaluationAudit (cascade delete)
- Session 1 — N AIInteraction (cascade delete)
- Session 1 — 1 FinalArtifacts (cascade delete)

### Indexing notes
- `sessions.question_id` indexed for the attempts dropdown
- `snapshots.session_id`, `phase_evaluations.session_id`, `ai_interactions.session_id` indexed
- `phase_evaluations.signal_results` GIN-indexed for cross-session signal queries

See `backend/prisma/SCHEMA.md` for the actual ER diagram.

---

## Component Boundaries

### Backend Modules (NestJS)

| Module | Responsibility |
|---|---|
| `QuestionsModule` | Create question + first attempt; start additional attempts (inherits seniority + plan.md). |
| `SessionsModule` | Pause/resume/end the active attempt; serialize `EndSessionResult` with the eval(s) run synchronously on end. |
| `SnapshotsModule` | Capture editor content every 5 min + on tab close; latest-snapshot lookup at evaluation time. |
| `HintsModule` | Socratic-coach chat backed by the LLM; persists `AIInteraction` rows; system prompt at `hints/prompts/hint-system-prompt.ts`. |
| `EvaluationsModule` | Orchestrate phase agents (only PlanAgent today); rubric loader; score computer; evidence validator; tool schema builder. Multi-phase fan-out architecture is wired but Build/Validate/Wrap/Synthesizer are stubs. |
| `LlmModule` | `LlmService` facade + `LlmProviderFactory` over `AnthropicProvider`, `OllamaProvider`, `ClaudeCliProvider`. Adds optional `tools` / `toolChoice` / `temperature` / system-block caching. |
| `ArtifactsModule` | Final artifact assembly. Stub today. |
| `PhaseTaggerModule` | Maps Claude Code JSONL events to phases. Stub today. |
| `DashboardModule` | Aggregation queries for trends / heatmaps / recurring weaknesses. Stub today. |

### Cross-cutting

- `common/filters/all-exceptions.filter.ts` — global filter; lets `HttpException` pass through, logs unhandled errors and returns a uniform `{ message, error }` envelope.
- `ValidationPipe` (NestJS built-in) — applied globally with `whitelist: true, transform: true, forbidNonWhitelisted: true`.

### Dependency direction
- `SessionsModule` → `EvaluationsModule` → `LlmModule`, `SnapshotsModule`, `HintsModule` (forwardRef)
- `QuestionsModule` → `SessionsModule` (forwardRef)
- `EvaluationsModule` → `RubricLoaderService` → YAML files (no DI cycle)
- `DashboardModule` → repositories only (no service-layer coupling)

---

## Key Interfaces

```typescript
// LlmModule
interface LlmCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string | SystemBlock[];
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

interface LlmResponse {
  text: string;                     // empty when tool_choice forced and model complied
  toolUse?: { name: string; input: unknown };
  modelUsed: string;
  tokensIn: number; tokensOut: number;
  cacheReadTokens: number; cacheCreationTokens: number;
}

interface LlmProvider {
  readonly name: string;
  call(messages: ChatMessage[], opts: LlmCallOptions): Promise<LlmResponse>;
}

// EvaluationsModule
interface PhaseEvalInput {
  session: { id: string; prompt: string; startedAt: Date; endedAt: Date | null };
  planMd: string | null;
  snapshots: Array<{ takenAt: Date; elapsedMinutes: number; planMdSize: number }>;
  hints: Array<{ occurredAt: Date; elapsedMinutes: number; prompt: string; response: string }>;
  rubricVersion: string;
  mode?: Mode | null;
  seniority?: Seniority | null;
  model?: string;
}

interface PhaseEvaluationResult {
  phase: Phase;
  score: number;
  signalResults: Record<string, SignalResult>;
  feedbackText: string;
  topActionableItems: string[];
  audit: EvaluationAuditPayload;
}

abstract class BasePhaseAgent {
  abstract evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult>;
}

interface SignalResult {
  result: 'hit' | 'partial' | 'miss' | 'cannot_evaluate';
  evidence: string;
  reasoning?: string; // populated only on the tool-use path
}

// QuestionsModule
interface QuestionsService {
  create(dto: CreateQuestionDto): Promise<{ question: Question; session: Session }>;
  startAttempt(questionId: string, seniorityOverride?: Seniority): Promise<Session>;
}
```

---

## Failure Modes

### Handled
- **Tab closed mid-session.** `sendBeacon` flushes the editor's current content as a final snapshot. Session-store + `localStorage` mirror keeps `started_at`. Pause/resume tracks accumulated paused time so the elapsed timer is accurate after a tab restore.
- **LLM API failure.** `LlmProvider` throws; the global `AllExceptionsFilter` logs and returns `{ message: 'Internal server error', error }`. The plan agent's evaluation aborts; the session's `evalError` field surfaces the message in the results page.
- **Malformed LLM output.** On Anthropic, the schema makes this nearly impossible. On Ollama / Claude CLI, `parseEvalOutput` strips fences, extracts the first balanced `{…}`, and validates shape; on failure throws `EvaluationParseError` (which renders to the user via the global filter).
- **Hallucinated signal IDs.** Tool-use path: `additionalProperties: false` rejects them at sample-time. Fallback path: `validateEvalToolArgs` (used for both paths' shape validation) refuses unknown IDs.
- **Hallucinated quotes.** `validateEvidence` ground-checks against `plan.md` + hint history; ungrounded HIT/PARTIAL gets downgraded one notch with `[unverifiable evidence]` annotation.
- **LLM-emitted score drifts from rubric anchors.** `computeScore` ignores LLM's score and applies the deterministic threshold table. The mismatch is logged at WARN level when `|llm - computed| ≥ 1`.
- **Database write failure during evaluation.** Transaction rolls back; user can retry via the Re-evaluate button.

### Punted (out of scope for v1)
- Concurrent sessions for the same question (single user, low risk)
- Recovery of partially-completed evaluations after server restart
- LLM rate-limit / billing failures
- Disk-full / infra failures

---

## Build Sequence

✅ = shipped, ⏳ = wired but stubbed, ❌ = not yet built.

1. ✅ Schema + hand-written migrations — Postgres + Prisma, including the `Question`/`Session` split, `EvaluationAudit`, `Seniority` enum.
2. ✅ NestJS scaffolding — modules, DI, global ValidationPipe + AllExceptionsFilter.
3. ✅ Question + first-attempt creation flow — frontend `SessionStartPage` with mode + seniority pickers; backend `QuestionsService.create`.
4. ✅ Active session UI — Monaco editor, autosave, pause/resume, sendBeacon, hint-chat panel.
5. ✅ Snapshot capture — 5-min autosave + manual Save Now + sendBeacon final flush.
6. ✅ Plan-phase evaluation — rubric loader, mode + seniority resolution, prompt builder, tool schema, evidence validator, score computer, audit row.
7. ✅ LLM provider factory — Anthropic + Ollama + Claude CLI.
8. ✅ Forced tool-call output (Anthropic) — `tool_choice` + `temperature: 0` + dynamic schema from rubric.
9. ✅ Results page — score breakdown chart, attempts dropdown, audit modal (lazy), retry-as-different-seniority picker, model picker for re-evaluation.
10. ✅ Eval harness — `npm run eval:plan` regression suite with hallucination-trap fixture.
11. ⏳ Multi-phase fan-out — agents wired in `EvaluationsModule`; `BuildAgent` / `ValidateAgent` / `WrapAgent` / `SynthesizerAgent` need real implementations.
12. ❌ Dashboard — trends chart, heatmap, recurring weaknesses across sessions.
13. ❌ Final artifact assembly — `ArtifactsModule` is a stub.
14. ❌ JSONL phase-tagger revival — only if/when external editor support comes back.

Each shipped step provides value before the next is built.

---

## Validation Plan

### Per-step validation during build

- Schema: tables created via `npx prisma migrate deploy`, verified with `npx prisma studio`.
- API: tests under `*.spec.ts` for repositories, services, and controllers (149+ unit tests, all green).
- Snapshot capture: live test by editing in the browser, then inspecting `snapshots` rows in Prisma Studio.
- Plan-phase evaluation: end-to-end live session against Anthropic; confirm the audit row's `prompt` field contains the tool schema, `raw_response` is structured JSON args, and `signalResults` covers every rubric signal.
- Hallucination guardrails:
  - **Tool-use**: confirm via audit modal that `raw_response` parses as JSON without fence-stripping.
  - **Evidence validator**: run the `url-shortener-handwaved` eval-harness fixture; confirm 4–6 signal downgrades (the fixture deliberately seeds plausible-looking but ungrounded quotes).
  - **Deterministic score**: pick a session, manually edit the LLM-emitted score in the audit JSON; re-run `computeScore` mentally and confirm the persisted score matches the deterministic value, not the edit.
- Eval harness: `npm run eval:plan` — all fixtures within their `expectedScore: { min, max }` range and `expectedSignals` met.

### Demo-scale verification

- One full 1-hour session run end-to-end on the live tool, ending with a results page that matches what manual evaluation would produce within ±0.5 score points per phase.
- Retry the same question at a different seniority level; confirm the new attempt's per-signal weights shifted (visible in the audit modal's prompt body) and the score band shifted accordingly.

---

## AI Usage Plan

### Delegated to AI (Claude Code during build)
- NestJS module scaffolding and boilerplate
- Prisma schema generation from the data model + hand-written migration SQL
- React component scaffolding (forms, tables, charts)
- Test scaffolding (`*.spec.ts` patterns)
- Tailwind styling iterations

### Written by developer
- Rubric YAML files (signals, weights, anchors, calibration notes)
- Prompt structure for `plan-prompt.ts` and the tool schema in `plan-tool-schema.ts`
- Evaluator orchestration logic and threshold-table scoring algorithm
- Evidence validator's matching strategy (sliding 30-char + 5-word-gram fallback)
- Decisions about which signals fire in edge cases

### Sparring with AI
- Reviewing the rubric prompt structure for edge cases
- Testing whether the judge prompt produces sharp feedback against sample plan.md files (eval-harness)
- Calibration: comparing scores at different seniorities for the same plan to confirm the weight-shift produces sensible movement

---

## Trade-Offs Accepted

1. **Tool hosts the editor (pivoted from observer pattern).** Trade-off: lost the "use real Claude Code" angle and the JSONL-derived activity timeline; gain: dramatically simpler architecture, no parser fragility, cleaner audit trail.
2. **One phase agent in production (not four).** Trade-off: build/validate/wrap signals aren't graded today; gain: shipped a working evaluator that catches the most important signals (planning is where most candidates fail) without waiting on an editor that supports code + tests.
3. **Forced tool-call (Anthropic-only) + JSON-in-prose fallback (others).** Trade-off: the strongest guardrails only apply on the production provider; gain: dev/local Ollama path still works without extra infra; the agent has one implementation that branches on `response.toolUse`.
4. **Synchronous evaluation (pivoted from async polling).** Trade-off: page blocks for ~10s on session end; gain: removed an entire polling system. Async pattern returns when build/validate/wrap come online.
5. **Postgres + JSONB hybrid.** Trade-off: cross-session signal queries need GIN scans; gain: rubric changes don't require schema migrations, foreign keys for data integrity, SQL for dashboards.
6. **Per-attempt seniority (pivoted from per-question).** Trade-off: a question's two attempts may carry different seniorities, slightly complicating cross-attempt comparison; gain: the same question genuinely gets retried at different bars, which is the whole point.
7. **Deterministic score over LLM-emitted score.** Trade-off: lose the model's "intuition" on the final number; gain: scores reproduce across re-runs and don't drift with rubric phrasing changes.

---

## Notes for Future Iterations

- **Bring up Build / Validate / Wrap agents** when the in-tool editor expands beyond `plan.md` (code + tests). The DI scaffolding is already there.
- **Surface `signalResults[*].reasoning` in the UI** when audit-modal usage suggests it's worth the screen real estate. Currently captured silently for debugging.
- **Dashboard module** — score trends per question + per seniority, recurring-weakness heatmap, signal-firing rate across sessions.
- **Per-snapshot LLM notes** — could feed a session-timeline view if we ever add one. Cheap to compute (Haiku-tier), but adds complexity.
- **Rubric forking by problem type** (LLM-systems vs. data-pipelines vs. distributed-systems) only after evidence that the universal v2.0 rubric produces uneven feedback across problem types.
- **Migrate v1.0 sessions to v2.0** by re-evaluation. Currently they coexist; legacy rows have `mode = seniority = NULL`.
