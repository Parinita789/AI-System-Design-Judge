# Architectural Decisions — AI System Design Judge

This document captures the *why* behind key architectural choices. For the *what* and *how* of building, see `plan.md`.

---

## 1. Tech Stack

### Decision: NestJS (Node.js, TypeScript) for backend

### Decision: PostgreSQL with JSONB columns for storage

**Why:**
- Data is fundamentally relational: sessions have snapshots, sessions have evaluations, evaluations have signal results.
- JSONB handles the variable-shape parts (signal results, artifacts) without schema migrations every time the rubric changes.
- Foreign keys with cascading deletes prevent orphaned data.
- SQL window functions and aggregations make the dashboard queries (trends, heatmaps) trivial.
- Boring, well-understood, easy to debug at 11pm.

**Alternatives rejected:**
- MongoDB: data is relational, document size limits would bite as snapshots accumulate, aggregation pipelines harder to maintain than SQL.
- SQLite: works for personal use but breaks if dashboard is ever accessed from another device. Migration cost outweighs savings.

---

### Decision: React + Tailwind + Recharts + Monaco Editor for frontend

**Why:**
- React is the default, well-supported choice.
- Tailwind for fast styling without CSS file management.
- Recharts handles the trend chart and heatmap with minimal code.
- Monaco editor only used for *displaying* artifacts in the dashboard view (read-only). The user writes plan.md and code in their own VS Code with Claude Code, not in the tool.

---

### Decision: Anthropic Claude API as the LLM provider

**Why:**
- Matches the user's actual workflow (Claude Code in VS Code).
- Same model family for evaluation as for the AI interactions being evaluated reduces interpretation gaps.
- Strong instruction-following for structured rubric scoring.

---

## 2. Workflow Integration

### Decision: Tool observes the user's project directory; does NOT host the editor

**Why:**
- Real interview practice means using real tools (VS Code + Claude Code), not a custom in-browser editor.
- A custom editor would force the user to learn a different surface for practice vs. real interviews — defeats the purpose.
- The tool's job is to *evaluate*, not to *host*. Keeping these separate keeps the evaluation honest.

**Implication:**
- User picks a project directory at session start.
- Tool reads files from that directory periodically.
- No filesystem write access from the tool — read-only observer.

---

### Decision: Use Claude Code's `.jsonl` log as the source of truth for AI interactions

**Why:**
- Claude Code already logs every prompt, response, and tool call to `~/.claude/projects/<project>/`.
- Re-implementing prompt logging in the tool would require an in-tool AI panel and forfeit the real Claude Code experience.
- The JSONL contains timestamps, tool calls, and full conversation history — everything the rubric's AI usage signals need.

**Implication:**
- No manual prompt logging by the user.
- Tool parses `.jsonl` files at evaluation time.
- AI interactions table populated from JSONL, not from real-time capture.

---

### Decision: Artifact-based phase inference (no explicit phase markers)

**Why:**
- Asking the user to manually signal phase transitions ("I'm done planning now") is unreliable — they'll forget under time pressure.
- File activity is a strong proxy: editing only plan.md = planning, editing implementation files = building, running tests = validating.
- Inference happens retrospectively at evaluation time, not real-time, so the system has the full activity log to work with.

**Implication:**
- Phase tagging is best-effort, not exact. Edge cases (editing plan.md mid-build) are handled by dominant-activity-in-window heuristic.
- A few mislabeled entries won't materially change the judge's overall verdict.

**Alternatives rejected:**
- Pure timestamp-based phasing (e.g., 0-20 min = plan): mislabels any session that doesn't follow time budgets exactly.
- Explicit markers typed by user: unreliable in practice.

---

## 3. Evaluation Architecture

### Decision: Multi-agent evaluation with phase-specialist agents + synthesizer

**Why:**
- Each phase's rubric is large enough that giving an agent only its phase's rubric (rather than all four) produces sharper scoring.
- Phase agents run in parallel — 4 calls simultaneously have roughly the same wall-clock time as 1 call.
- Independent failure: if one agent fails, the others still produce results; synthesizer notes the gap.
- Easier rubric iteration: tuning the planning rubric only requires changing one agent's prompt.

**Architecture:**
```
End of session
  ├── Plan Agent       (parallel)
  ├── Build Agent      (parallel)
  ├── Validate Agent   (parallel)
  └── Wrap Agent       (parallel)
       ↓
  Synthesizer Agent (sequential, after all 4 complete)
```

**Limit:**
- Not going further into multi-agent within a phase (e.g., separate "scope agent" inside planning). The rubric is small enough that one agent per phase handles it cleanly. More agents = more coordination overhead = diminishing returns.

---

### Decision: In-process Promise.all orchestration, not a queue

**Why:**
- Single user, bounded workload, known set of agents — none of the conditions that make queues valuable.
- Backend orchestrator fires LLM calls in parallel via `Promise.all`, awaits all, then runs synthesizer.
- Adding a queue (Redis, SQS, BullMQ) would be over-engineering at this scale.

**Agent <-> orchestrator transport:**
- The phase agents and synthesizer are NestJS singletons in the same Node process. `await agent.evaluate(...)` is an in-process method call; the returned `PhaseEvaluationResult` is an object reference in the same V8 heap, not an HTTP response.
- The only HTTP on the evaluation path is each agent's outbound call to the Anthropic API. Inputs (artifacts, tagged JSONL entries, rubric) are gathered once by the orchestrator and passed to each agent by reference — no copying, no serialization.

**When this would change:**
- Multiple users with backpressure needs.
- Per-call latency exceeding HTTP timeout (>60s).
- Need for distributed agents across machines.

---

### Decision: Async polling pattern for end-of-session evaluation

**Why:**
- 5 LLM calls (4 parallel + 1 sequential) can take 30-90s total.
- Blocking the HTTP request that long is bad UX and risks timeouts.
- Pattern: `POST /sessions/:id/end` returns immediately with `evaluation_id`; frontend polls `GET /evaluations/:id/status` until complete.
- Backend runs the pipeline as a NestJS background task.

**Not a queue:**
- This is async job handling, not message queuing. No retry-on-failure infrastructure, no worker pool, no broker.

---

## 4. Real-Time Capture

### Decision: Client-side timer driving 5-minute snapshot captures

**Why:**
- Single user — server-side timers add complexity (websockets, reconnection, server-side scheduling) for no benefit.
- Browser `setInterval` triggers a POST to the backend every 5 min.
- localStorage persists `session_id` and `started_at` to survive tab close.

**Limit:**
- If the tab is closed for >5 min, the snapshot for that interval is missed. Acceptable for personal use; would need server-side scheduling for production.

---

### Decision: Snapshots capture text artifacts only, not screenshots

**Why:**
- Screenshots cost ~50-200KB each, scale badly across sessions.
- Vision OCR at evaluation time is slow and expensive.
- Screenshots are noisy (window chrome, cursor, irrelevant pixels).
- Text artifacts (file contents, git log, JSONL entries) capture everything the judge actually needs.

**What gets captured per snapshot:**
1. Current state of plan.md and code files
2. Git log if repo exists
3. New Claude Code JSONL entries since last snapshot
4. Elapsed time and inferred current phase

**Storage:** ~5-50KB per snapshot, ~24 snapshots per 2hr session, ~1MB per session total. Trivially storable.

---

## 5. Database Schema

### Decision: 5 tables, with JSONB for variable-shape data

**Tables:**
- `sessions` (parent)
- `snapshots` (time-series during session)
- `phase_evaluations` (per-phase scoring at session end)
- `ai_interactions` (parsed from Claude Code JSONL)
- `final_artifacts` (final state at session end)

### Decision: JSONB for `signal_results`, `artifacts`, etc., not full normalization

**Why:**
- Rubric signals change over time as the rubric iterates. Each rubric change in a normalized schema would require migrations.
- Read patterns are "show me everything for this evaluation," not "find all evaluations of signal X across sessions" — the second query is rare.
- GIN indexes on JSONB make cross-session signal queries fast enough when needed.

**When to revisit:**
- If cross-session signal-trend queries become the dominant access pattern, consider a derived view or projection table.

---

### Decision: Foreign keys with `ON DELETE CASCADE`

**Why:**
- Deleting a session should clean up its snapshots, evaluations, interactions, and artifacts atomically.
- Postgres enforces this at the storage layer — no application-level cleanup logic needed.

---

## 6. Scope Boundaries (v1)

### Decisions about what NOT to build:

- **No real-time judge interruptions during session.** Silent observer until session ends, then full feedback. Mirrors real interview format and avoids training dependency on AI nudges.
- **No cross-session memory in the judge.** Each session evaluated independently. Trend analysis happens in the dashboard, not the judge.
- **No support for AI tools other than Claude Code.** Adds complexity for marginal benefit; can be revisited if needed.
- **No multi-user / authentication.** Personal tool. Auth adds setup time without value at this stage.
- **No hosted deployment.** Local-only for v1. Render/Railway later if cross-device access becomes useful.
- **No rubric editing UI.** Rubrics live as YAML files in the codebase. Editing is a code change. Avoids building a CMS for a single user.

---

## 7. Rubric Versioning

### Decision: Store `rubric_version` on each session row

**Why:**
- Rubrics will iterate. A session evaluated under v1.0 should remain comparable only to other v1.0 sessions.
- Trend charts in the dashboard filter by rubric version to avoid comparing apples to oranges across rubric changes.
- Old sessions are not re-evaluated when the rubric changes — historical scores are preserved as-is.

---

## Open Decisions (To Revisit After v1)

- Whether to add per-snapshot LLM notes (cheap calls during session, builds time-series of judge observations) or skip them and rely on retrospective evaluation only.
- Whether to add a "manual narration" input where the user types short notes during the session.
- Whether to support hybrid Claude Code + external AI tools (e.g., Claude.ai chat for sparring on plan).
- Whether to fork the rubric per problem type (e.g., LLM-systems vs. distributed-systems vs. data-pipelines) or keep one universal rubric.