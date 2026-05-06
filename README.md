# Interview Assistant

A practice-and-feedback tool for system-design interviews. You paste a
question, write a `plan.md` (with embedded Mermaid diagrams) in a
Monaco editor, and an LLM evaluates it against a structured rubric —
returning per-signal verdicts, a deterministic score, written feedback,
and concrete next actions. Two post-eval LLM calls layer on coaching:
a "deep-dive" mentor artifact (a 6-section senior-engineer reflection
on the whole plan) and a per-signal mentor artifact (2–4 sentence
plan-specific coaching shown inline beside each *gap* row — missed
good signals or fired bad signals).

The interesting parts aren't the editor or the score; they're the
guardrails that keep the LLM honest:

- **Forced tool-call output** so the model can't invent signal IDs,
  drop required signals, or emit malformed JSON.
- **Evidence validator** that ground-checks every quoted snippet
  against the candidate's own `plan.md` and chat history; ungrounded
  evidence triggers an automatic verdict downgrade.
- **Hallucinated-ID filter** in the text-mode parser: providers without
  tool-use (Claude CLI, Ollama) can still return signal verdicts, but
  any id not in the rubric is silently dropped and logged so it never
  reaches the audit row or the score.
- **`applies_to` domain gating** — signals tagged `applies_to: [agentic]`
  in YAML are surfaced to the judge with explicit instructions to mark
  them `cannot_evaluate` on non-agentic questions, so a URL-shortener
  plan isn't penalized for not articulating per-call inference cost.
- **Deterministic score** computed from signal verdicts via a
  threshold table — the LLM never gets to pick the final number.
  `cannot_evaluate` signals are excluded from both numerator and
  denominator.
- **Per-attempt seniority calibration** (Junior / Mid / Senior /
  Staff) that shifts per-signal weights so the same plan is judged
  appropriately for the candidate's level.
- **Per-attempt mode classification** (build vs. design) so a
  small "build a counter" question and a "design Twitter" question
  use different rubric variants.
- **plan.md truncation + token-budget telemetry**: hard 50K-char cap
  on plan.md before it enters the prompt (60/40 head-tail split with
  an explicit omission marker); WARN log when total input tokens
  exceed 150K so overflow risk on smaller-context models stays visible.

## Stack

- **Backend**: NestJS 10 + TypeScript, Prisma ORM, PostgreSQL.
  Anthropic SDK is the production LLM path; Ollama and the Claude
  Code CLI are alternative providers for local dev.
- **Frontend**: React 18 + TypeScript, Vite, Tailwind, Monaco
  editor, React Query, Recharts, Mermaid (lazy-imported).
- **Eval harness**: standalone ts-node CLI (`npm run eval:plan`)
  that runs the real `PlanAgent` against versioned plan.md fixtures
  with expected score ranges.

## Repo layout

```
backend/
  src/
    common/                  cross-cutting (AllExceptionsFilter)
    modules/
      artifacts/             final artifact assembly (stub)
      dashboard/             cross-session aggregates
      evaluations/           rubric-driven plan-phase judging
        agents/              @Injectable phase agents
        prompts/             plan-prompt.ts, plan-tool-schema.ts
        validators/          parse-eval-output, validate-eval-tool-args, evidence-validator
        services/            orchestrator, rubric-loader, score-computer
        types/               evaluation/rubric data shapes
      hints/                 Socratic-coach chatbot during the session
      llm/                   provider factory (Anthropic | Ollama | Claude CLI)
      mentor/                post-eval teaching artifact (separate LLM call)
      signal-mentor/         per-signal inline coaching (batched LLM call)
      phase-tagger/          maps Claude Code JSONL events to phases (stub)
      questions/             question + first-attempt creation
      sessions/              attempt lifecycle (start, pause, end)
      snapshots/             plan.md autosaves
  prisma/
    schema.prisma            single source of truth for DB models
    migrations/              hand-written SQL (see SCHEMA.md)
    SCHEMA.md                ER diagram + design notes
  rubrics/
    v1.0/plan.yaml           legacy single-file rubric (no mode/seniority)
    v2.0/                    shared + variants (build, design)
  eval-harness/              regression suite — see eval-harness/README.md

frontend/
  src/
    components/              ScoreBreakdown chart, HintChatPanel, layout
                             MarkdownView + MermaidBlock (SVG renderer),
                             MentorArtifactView (collapsible sections)
    pages/
      SessionStart/          new-question form (mode + seniority pickers)
      ActiveSession/         editor + autosave + hint panel + Mermaid preview
                             (Edit / Split / Preview toggle, paste-source dialog,
                              deep-link to mermaid.live, resizable coach pane)
      SessionResults/        per-signal breakdown with inline Coach blocks,
                             attempts, audit modal, deep-dive mentor disclosure
    services/                axios clients (questions, sessions, hints, evaluations)
    types/                   shapes mirrored from the backend API
```

## Setup

### 1. Postgres

```bash
brew install postgresql@16
brew services start postgresql@16
createdb ai_judge
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env  # then edit — see "Environment" below
npx prisma migrate deploy
npm run start:dev
```

Backend listens on `http://localhost:3000` with prefix `/api`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend on `http://localhost:5173`. CORS is wired between the two by
default.

### Environment (`backend/.env`)

```ini
NODE_ENV=development
PORT=3000

DATABASE_URL=postgresql://USER@localhost:5432/ai_judge?schema=public
ANTHROPIC_API_KEY=sk-ant-...
LLM_MODEL=claude-opus-4-7
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1
LLM_PROVIDER=claude_cli
LLM_MAX_TOKENS=4096
RUBRIC_VERSION=v2.0
RUBRIC_DIR=./rubrics
```

Provider selection priority:

1. `LLM_PROVIDER=claude_cli` → spawn `claude -p`
2. `ANTHROPIC_API_KEY` set → Anthropic SDK
3. otherwise → Ollama

## How the evaluator works

Once a session ends (or the user clicks Re-evaluate), the
`PlanAgent` runs through this pipeline:

1. **Load the rubric.** `RubricLoaderService.load(version, phase, mode, seniority)`
   reads YAML, merges shared + variant for v2.0, resolves
   per-signal `weight_by_seniority` to a single `weight`, and
   carries each signal's `applies_to` tag through to the prompt.
2. **Truncate plan.md.** `truncatePlanMd` enforces a 50K-char cap
   with a 60/40 head-tail split and an explicit omission marker.
   Mermaid diagrams ride along inside `plan.md` as fenced
   `​`​`​`mermaid` blocks; the judge reads them as architectural
   articulation. The "How to find evidence" prompt directive tells
   the judge to search the *whole* artifact for each signal's
   concept rather than restricting itself to expected section
   headers — section headers are organizational hints, not gates.
3. **Build the prompt + tool schema.** `buildPlanPrompt` renders
   the rubric, mode-specific framing, seniority calibration, and
   per-signal `applies_to` tags. `buildPlanEvalTool` constructs an
   Anthropic tool whose `input_schema` enumerates every signal id
   with `additionalProperties: false` and a `reasoning → result →
   evidence` field order per signal.
4. **Force the LLM to call the tool.** With `tool_choice: {type:
   'tool', name: 'submit_evaluation'}` and `temperature: 0`, the
   model can't return prose, can't omit a signal, can't invent an
   id. Ollama and Claude CLI fall back to a JSON-in-prose path; the
   text-mode parser still drops any signal ids outside the rubric
   (logged WARN) so hallucinated ids never reach the audit row.
5. **Validate evidence.** `validateEvidence` runs sliding 30-char
   and 5-word-gram matches against `plan.md` + hint history. Any
   HIT/PARTIAL whose evidence isn't grounded is downgraded one
   notch (HIT → PARTIAL, PARTIAL → MISS) and annotated.
6. **Compute the score.** `computeScore` ignores anything the LLM
   said about scoring. It applies per-signal weights, a paired
   good ↔ bad pairing rule, a threshold table (`ratio ≥ 0.85
   ∧ no high-weight miss → 5`, etc.), and critical-signal caps.
   `cannot_evaluate` signals are excluded from numerator and
   denominator so domain-gated signals don't drag scores down.
7. **Persist the audit.** Every evaluation row is paired 1:1
   with an `EvaluationAudit` row that captures the rendered
   prompt, the tool schema, the raw response, the model used,
   token counts, and cache hit/miss tokens. A WARN log fires when
   total input tokens exceed 150K.
8. **Fire the mentor.** Once the eval persists, a separate LLM
   call (`MentorAgent`) produces a 6-section Markdown teaching
   artifact: what the candidate got right, what they missed, a
   defensible-but-non-obvious decision to examine, the clarifying
   question they didn't ask, one thing to add in three more
   minutes, and a concept ledger. The artifact is saved on a 1:1
   row with the evaluation, plus to disk for audit, and rendered
   on the results page behind a "Read the deep-dive feedback"
   disclosure (with collapsible sections).
9. **Fire the per-signal mentor.** In parallel with step 8, a
   `SignalMentorAgent` call produces 2–4 sentences of plan-specific
   coaching for every *gap* signal — missed-good (good polarity +
   miss/partial) or fired-bad (bad polarity + hit/partial). One
   batched LLM call returns a `{signal_id → annotation}` map enforced
   by a tool schema with `required: [<gap ids>]` and
   `additionalProperties: false`. Annotations render inline inside
   each rubric row on the results page, beneath the evaluator's
   evidence quote, on an indigo "Coach" block. Wins (HIT-good and
   MISS-bad) get no annotation — coaching the obvious is noise.
   Persisted 1:1 with the evaluation in `signal_mentor_artifacts`.

## Common workflows

```bash
# Backend: tests + type check
cd backend
npx tsc --noEmit
npm test

# Run the plan-phase eval harness against your configured provider
npm run eval:plan
npm run eval:plan -- --filter=url-shortener  # single fixture
npm run eval:plan -- --out=report.json       # JSON report

# DB
npx prisma migrate dev --name <change>
npx prisma studio  # browse rows in a UI

# Frontend
cd frontend
npm run dev
npx tsc --noEmit
```

## Evaluator design references

- **`backend/prisma/SCHEMA.md`** — ER diagram and intent for each
  table.
- **`backend/eval-harness/README.md`** — fixture format, runner
  behavior, regression-suite intent.
- **`backend/rubrics/v2.0/`** — annotated rubric YAMLs. Read
  `plan.shared.yaml` first, then `plan.build.yaml` and
  `plan.design.yaml` for the variant-specific signal sets.
- **`decisions.md`** and **`plan.md`** in the repo root — running
  log of architectural decisions and current planning notes.
