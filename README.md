# Interview Assistant

A practice-and-feedback tool for system-design interviews. You paste a
question, write a `plan.md` (with embedded Mermaid diagrams) in a
Monaco editor, and an LLM evaluates it against a structured rubric —
returning per-signal verdicts, a deterministic score, written feedback,
gap topics to study, and concrete next actions. After the plan, you
can optionally run a CLI watcher (`mentor watch`) in your project
directory while you implement; it ships file saves and Claude Code
conversation turns to the backend, which scores a separate
**build-phase evaluation** against a build rubric. Two post-eval LLM
calls layer on coaching for both phases: a "deep-dive" mentor
artifact (a 6-section senior-engineer reflection on the whole phase,
with cross-phase context once the counterpart eval has landed) and a
per-signal mentor artifact (2–4 sentence plan-specific or
build-specific coaching shown inline beside each *gap* row — missed
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
- **Build-phase capture is per-row.** A standalone `mentor watch` CLI
  (npm-linkable from `cli/`) streams file saves to the backend in 30s
  batches; an opt-out flag (`--no-ai-logs`) controls whether it also
  reads Claude Code conversation turns out of
  `~/.claude/projects/<encodedCwd>/`. Auth is a per-session bearer
  token (`bcrypt`-hashed at rest, scoped via the
  `<sessionId>.<secret>` format so the guard does an O(1) row
  lookup before the bcrypt compare). The build evaluator
  reconstructs the final tree from the event log and trims to a
  prompt-shaped slice (top-N high-churn snippets, recent K AI turns).
- **Phase-aware mentor + signal-mentor.** Both fire after plan AND
  build evals. The build-phase persona reads the captured artifacts
  (file tree, file snippets, AI turns) and anchors concrete-version
  coaching to file paths instead of plan.md text. When both phases
  exist for a session, each side carries cross-phase context to the
  prompt so Section 1 ("what you got right") spans both phases.
- **`gap_topics`** persisted per phase eval — a frozen-vocabulary
  list of system-design topics directly relevant to the question
  that the candidate either missed or only lightly touched. Drives
  a future study feature that aggregates gaps across sessions.
- **Graceful shutdown.** `BackgroundTaskTracker` registers every
  fire-and-forget LLM call (mentor + signal-mentor + build-eval +
  disk cleanups). On SIGTERM/SIGINT, Nest's
  `beforeApplicationShutdown` waits up to 30s for tracked tasks to
  drain before letting Prisma disconnect — so a Docker stop or
  systemd reload doesn't cut a 60-second LLM call mid-write.

## Stack

- **Backend**: NestJS 10 + TypeScript, Prisma ORM, PostgreSQL.
  Anthropic SDK is the production LLM path; Ollama and the Claude
  Code CLI are alternative providers for local dev.
- **Frontend**: React 18 + TypeScript, Vite, Tailwind, Monaco
  editor, React Query, Recharts, Mermaid (lazy-imported).
- **CLI watcher** (`cli/`): TypeScript + commander + chokidar +
  axios; tails file saves and Claude Code conversation logs during
  the build phase, ships them to the backend in batches with a
  local JSONL buffer for resilience.
- **Eval harness**: standalone ts-node CLI that runs the real
  `PlanAgent` and `BuildAgent` against versioned fixtures with
  expected score ranges and per-signal expectations. Optional
  `--with-mentor` / `--with-signal-mentor` flags exercise the
  coaching layer too.

## Repo layout

```
backend/
  src/
    common/                  AllExceptionsFilter, BackgroundTaskTracker (graceful-shutdown drain)
    modules/
      artifacts/             final artifact assembly (stub)
      build-sessions/        CLI-watcher integration: token mint + event/AI-turn batches + finish
      dashboard/             cross-session aggregates
      evaluations/           rubric-driven plan + build judging
        agents/              PlanAgent, BuildAgent (BasePhaseAgent)
        prompts/             plan-prompt, plan-tool-schema, build-prompt, build-tool-schema
        validators/          parse-eval-output, validate-eval-tool-args, evidence-validator
        helpers/             reconstruct-build-tree, select-build-context, canonical-topics
        services/            orchestrator, rubric-loader, score-computer, build-context
        types/               evaluation / rubric / build-context shapes
      hints/                 Socratic-coach chatbot during the session
      llm/                   provider factory (Anthropic | Ollama | Claude CLI)
      mentor/                post-eval deep-dive artifact (phase-aware, with cross-phase context)
      signal-mentor/         per-signal inline coaching (phase-aware; build cites file paths)
      phase-tagger/          maps Claude Code JSONL events to phases (stub)
      questions/             question + first-attempt + delete-cascade
      sessions/              attempt lifecycle (start, pause, end, delete)
      snapshots/             plan.md autosaves
  prisma/
    schema.prisma            single source of truth for DB models
    migrations/              hand-written SQL (see SCHEMA.md)
    SCHEMA.md                ER diagram + design notes
  rubrics/
    v1.0/plan.yaml           legacy single-file rubric (no mode/seniority)
    v2.0/                    shared + variants — plan.{shared,build,design}.yaml,
                             build.{shared,build,design}.yaml
  eval-harness/              regression suite — see eval-harness/README.md
                             Build fixtures ship events.jsonl + ai-turns.jsonl

cli/
  src/
    index.ts                 commander wiring (watch / finish / status)
    watch.ts                 chokidar + JSONL buffer + drain loop
    aiLogs.ts                ClaudeCodeLogReader for ~/.claude/projects/<encodedCwd>/
    aiBuffer.ts              sibling buffer for AI turns
    api.ts                   axios client (Bearer header preconfigured)
    diff.ts                  unified-patch helpers
    config.ts                ~/.mentor/session.json read/write

frontend/
  src/
    components/              ScoreBreakdown chart, HintChatPanel, layout (sidebar + per-row delete),
                             BuildPhaseSection, MarkdownView + MermaidBlock,
                             MentorArtifactView (collapsible sections)
    pages/
      SessionStart/          new-question form (mode + seniority pickers)
      ActiveSession/         editor + autosave + hint panel + Mermaid preview
                             (Edit / Split / Preview toggle, paste-source dialog,
                              deep-link to mermaid.live, resizable coach pane)
      SessionResults/        per-signal breakdown with inline Coach blocks,
                             gap-topics block, build-phase section,
                             attempts, audit modal, deep-dive mentor disclosure,
                             Delete-attempt + per-row trash on the sidebar
      QuestionDetail/        empty state with Retry when a question has zero attempts
    services/                axios clients (questions, sessions, hints, evaluations,
                             buildSessions, mentor, signalMentor, rubrics)
    store/                   zustand sessionStore (active session + per-session pause state)
    types/                   shapes mirrored from the backend API

agents/                      static-analysis tooling for this monorepo
  mapper/                    LLM-driven agent: walks all 3 packages, emits
                             markdown maps with per-module responsibility prose
                             (agents/codebase-map/{backend,frontend,cli}.md)
  graphify/                  graphify-based code knowledge graphs + a suite of
                             helper scripts (flatten, build-mermaid, build-
                             neighborhoods, build-explorer) that turn the raw
                             graph into browsable Mermaid + D3 tree views
  codebase-map/              committed output: LLM-enriched markdown per package
                             plus per-package MODULE_RELATIONSHIPS.md (Mermaid)
```

See `agents/mapper/README.md` and `agents/graphify/README.md` for
the per-package workflows. Everything outside of those READMEs is
regenerable from scripts; only the LLM-enriched markdown is checked
in.

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

### 4. CLI watcher (optional, for the build phase)

```bash
cd cli
npm install
npm run build
npm link            # exposes `mentor` on $PATH
```

Then in the project directory you'll be implementing in:

```bash
mentor watch <token>                      # token comes from "Start build phase"
mentor watch <token> --no-ai-logs         # opt out of Claude Code log capture
mentor finish                             # flush + finalize the build phase
mentor status                             # local buffer + last-flush info
```

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

Once a session ends (or the user clicks Re-evaluate), the orchestrator
dispatches one or more phase agents. **Plan-phase** always runs;
**build-phase** runs additionally if `Session.buildEndedAt` is set
(meaning the candidate ran the CLI watcher and called
`mentor finish`). Each phase agent goes through the same shape of
pipeline below; `BuildAgent` differs only in the artifacts it reads
(file events, reconstructed final tree, AI conversation turns) and
the rubric it loads (`build.shared.yaml` + `build.{build,design}.yaml`).

The plan-side flow:

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
7. **Extract gap topics.** The same tool call returns up to 5
   `gap_topics` — system-design topics directly relevant to the
   question that the candidate either MISSED or only LIGHTLY
   TOUCHED. `name` is enum-validated against
   `helpers/canonical-topics.ts`; out-of-list paraphrases are
   dropped at the validator. Each entry includes a `why_expected`
   anchor citing the question / NFR / captured artifacts. Persisted
   on the eval row for the future study feature that aggregates
   gaps across sessions.
8. **Persist the audit.** Every evaluation row is paired 1:1
   with an `EvaluationAudit` row that captures the rendered
   prompt, the tool schema, the raw response, the model used,
   token counts, and cache hit/miss tokens. A WARN log fires when
   total input tokens exceed 150K.
9. **Fire the mentor + per-signal mentor.** Both run after every
   phase eval (plan and build) via `BackgroundTaskTracker.track`,
   so SIGTERM mid-LLM-call gets a chance to drain. Each loads the
   matching rubric for the eval's `phase`. The deep-dive `MentorAgent`
   produces a 6-section Markdown teaching artifact (what you got
   right, what you missed, a defensible-but-non-obvious decision,
   the clarifying question you didn't ask, one thing in three more
   minutes, concept ledger) — when both phases exist for the
   session, each side carries cross-phase context so Section 1
   spans both. The `SignalMentorAgent` produces 2–4 sentences per
   *gap* signal (missed-good or fired-bad); plan-side coaching
   cites plan.md text, build-side cites file paths from the
   captured tree. Both artifacts persist 1:1 with the evaluation
   and render on the results page (mentor behind a "Read the
   deep-dive feedback" disclosure; signal-mentor inline on each
   rubric row beneath the evaluator's evidence quote).

## Common workflows

```bash
# Backend: tests + type check
cd backend
npx tsc --noEmit
npm test

# Run the eval harness against your configured provider
npm run eval:plan                                       # plan fixtures only
npm run eval:build                                      # build fixtures only
npm run eval:all                                        # both phases
npm run eval:plan -- --filter=url-shortener             # single fixture
npm run eval:build -- --with-mentor --with-signal-mentor # exercise coaching too
npm run eval:plan -- --out=report.json                  # JSON report

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
