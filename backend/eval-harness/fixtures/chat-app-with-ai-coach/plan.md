# Chat app with Socratic AI coach — plan

## Scope

In: a web app where a user can paste a system-design question, write a plan in a markdown editor, and chat with an AI coach in a side panel. The coach gives Socratic hints (not solutions). On session end, an evaluator agent scores the plan against a rubric and shows the breakdown.

Out: voice, mobile, multi-user collaboration on the same plan, custom rubric authoring inside the app, generic chat (the bot is constrained to coaching).

## NFRs

- Single-user, local-first deployment. Practice sessions are typically 30–90 minutes, so latency budgets are loose: hint roundtrip ≤ 5s p95 is fine, evaluator can take 30–60s.
- Cost matters more than latency: the evaluator prompt is large (rubric + plan + hint history), so prompt caching is a hard requirement.
- 100 active users worldwide is the realistic scale, not 100K. Don't over-engineer.

## Shape and seams

- **LLM provider seam.** The hint-coach and the evaluator both call through one `LlmService` that hides which backend is in use (Anthropic API for production, Ollama for free local dev, Claude CLI when the user is logged in). Factory-pattern dispatch.
- **Rubric loader seam.** Rubrics are versioned YAML on disk; the evaluator agent loads by `(version, phase)`. Swappable for a remote registry later.
- **Persistence seam.** Sessions, snapshots, hint history, and evaluations all go through a Prisma layer; that's the only thing that knows about Postgres.

## AI strategy (explicit)

- **Coach mode**: Socratic, terse, no code. Hard rules in the system prompt forbid producing SQL/schema/API/pseudocode. One pointed question per reply. Goal: the user does the thinking.
- **Evaluator mode**: structured-output JSON only. Prompt includes the full rubric, the user's plan.md, snapshot timeline, and the entire hint chat history (so the evaluator can detect AI-authored plans). Prompt caching is enabled on the rubric block since it's identical across runs.
- **Failure mode for hallucinated signal IDs**: parser tolerates them (logs them as "extra signals returned by LLM") but doesn't score them. The UI surfaces them with a warning.
- **Relevance gating**: the evaluator is told to mark domain-irrelevant signals as `cannot_evaluate` instead of MISS, so a non-AI question doesn't get penalized for skipping AI signals.

## Data model

- `Question(id, prompt, rubric_version, created_at)` — top-level problem.
- `Session(id, question_id, status, started_at, ended_at)` — one attempt at the question.
- `Snapshot(id, session_id, taken_at, elapsed_minutes, artifacts)` — `artifacts.planMd` is the editor content at that point.
- `PhaseEvaluation(id, session_id, phase, score, signal_results, feedback_text, top_actionable_items, evaluated_at)` — one per Re-evaluate run.
- `EvaluationAudit(id, phase_evaluation_id, prompt, raw_response, model_used, tokens_in, tokens_out, ...)` — 1:1 audit row capturing what was sent to the LLM.
- `AIInteraction(id, session_id, prompt, response, ...)` — coach chat log.

## Components

- React+Vite frontend with a Monaco editor, a side-panel chat, and a results page that shows verdict tag + breakdown charts.
- NestJS backend organized by module: questions, sessions, snapshots, hints, evaluations, llm.
- Postgres for everything persistent.

## Validation plan

- Eval harness with a fixed set of plan.md fixtures and expected score ranges; run on every prompt or rubric change.
- Manual smoke: paste a known question, confirm the score lands in the expected band, confirm coach refuses to produce code on a "give me the schema" prompt.
