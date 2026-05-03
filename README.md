# AI System Design Judge

A practice-and-feedback tool for system-design interviews. You paste a
question, write a `plan.md` in a Monaco editor, and an LLM evaluates it
against a structured rubric — returning per-signal verdicts, a
deterministic score, written feedback, and concrete next actions.

The interesting parts aren't the editor or the score; they're the
guardrails that keep the LLM honest:

- **Forced tool-call output** so the model can't invent signal IDs,
  drop required signals, or emit malformed JSON.
- **Evidence validator** that ground-checks every quoted snippet
  against the candidate's own `plan.md` and chat history; ungrounded
  evidence triggers an automatic verdict downgrade.
- **Deterministic score** computed from signal verdicts via a
  threshold table — the LLM never gets to pick the final number.
- **Per-attempt seniority calibration** (Junior / Mid / Senior /
  Staff) that shifts per-signal weights so the same plan is judged
  appropriately for the candidate's level.
- **Per-attempt mode classification** (build vs. design) so a
  small "build a counter" question and a "design Twitter" question
  use different rubric variants.

## Stack

- **Backend**: NestJS 10 + TypeScript, Prisma ORM, PostgreSQL.
  Anthropic SDK is the production LLM path; Ollama and the Claude
  Code CLI are alternative providers for local dev.
- **Frontend**: React 18 + TypeScript, Vite, Tailwind, Monaco
  editor, React Query, Recharts.
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
    pages/
      SessionStart/          new-question form (mode + seniority pickers)
      ActiveSession/         editor + autosave + hint panel
      SessionResults/        per-signal breakdown, attempts, audit modal
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
   per-signal `weight_by_seniority` to a single `weight`.
2. **Build the prompt + tool schema.** `buildPlanPrompt` renders
   the rubric, mode-specific framing, and seniority calibration.
   `buildPlanEvalTool` constructs an Anthropic tool whose
   `input_schema` enumerates every signal id with
   `additionalProperties: false` and a `reasoning → result →
   evidence` field order per signal.
3. **Force the LLM to call the tool.** With `tool_choice: {type:
   'tool', name: 'submit_evaluation'}` and `temperature: 0`, the
   model can't return prose, can't omit a signal, can't invent an
   id. Ollama and Claude CLI fall back to a JSON-in-prose path.
4. **Validate evidence.** `validateEvidence` runs sliding 30-char
   and 5-word-gram matches against `plan.md` + hint history. Any
   HIT/PARTIAL whose evidence isn't grounded is downgraded one
   notch (HIT → PARTIAL, PARTIAL → MISS) and annotated.
5. **Compute the score.** `computeScore` ignores anything the LLM
   said about scoring. It applies per-signal weights, a paired
   good ↔ bad pairing rule, a threshold table (`ratio ≥ 0.85
   ∧ no high-weight miss → 5`, etc.), and critical-signal caps.
6. **Persist the audit.** Every evaluation row is paired 1:1
   with an `EvaluationAudit` row that captures the rendered
   prompt, the tool schema, the raw response, the model used,
   token counts, and cache hit/miss tokens.

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
