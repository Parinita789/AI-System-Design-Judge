# backend module map

_Generated 2026-05-11T17:50:50.086Z (model: claude-sonnet-4-6)_

## Summary

- **18** modules
- **128** source files + **39** test files
- **3** modules with no inbound internal deps (entry points / leaves)

## Module: artifacts

**Path:** `backend/src/modules/artifacts`
**Files:** 7
**Key exports:** `ArtifactsModule`, `ArtifactsRepository`, `ArtifactsService`, `ClaudeJsonlService`, `GitLogService`, `ProjectFilesService`, `JsonlEntry`, `FinalArtifacts`
**Depends on (internal):** database, snapshots
**Depended on by (internal):** _root, evaluations, phase-tagger
**External:** `@nestjs/common`

**Responsibility:** The `artifacts` module collects and persists the observable outputs of a coding session. `artifacts.service.ts` coordinates three specialized readers — project files, Claude JSONL logs, and git history — to assemble both incremental snapshots and final `FinalArtifacts` records (plan markdown, code files, git log, AI prompt log, reflection). `artifacts.repository.ts` then handles durable storage of those final records via the database module.

## Module: build-sessions

**Path:** `backend/src/modules/build-sessions`
**Files:** 11 (5 tests)
**Key exports:** `BuildSessionsModule`, `BuildAIInteractionDto`, `BuildAIInteractionBatchDto`, `BuildEventDto`, `BuildEventBatchDto`, `BuildSessionGuard`, `resolvedBuildSessionId`, `AuthedRequest`, +10 more
**Depends on (internal):** database, evaluations, common
**Depended on by (internal):** _root, evaluations
**External:** `@nestjs/common`, `@nestjs/swagger`, `class-transformer`, `class-validator`, `bcryptjs`

**Responsibility:** The `build-sessions` module manages the lifecycle of a candidate's "agentic build" phase within an evaluation session. `build-sessions.module.ts` wires together controllers and services that mint short-lived bearer tokens (via `build-token.service.ts`) so a local CLI can authenticate, then stream batched file-system events and Claude Code conversation turns back to the server. Once the build phase finishes, the module freezes that log and triggers downstream evaluation via the `evaluations` module.

## Module: dashboard

**Path:** `backend/src/modules/dashboard`
**Files:** 5
**Key exports:** `DashboardModule`, `DashboardController`, `DashboardRepository`, `DashboardService`, `TrendPoint`, `HeatmapCell`, `WeaknessSummary`
**Depends on (internal):** database, phase-tagger
**Depended on by (internal):** _root
**External:** `@nestjs/common`, `@nestjs/swagger`

**Responsibility:** The `dashboard` module exposes three read-only HTTP endpoints — score trend over time, a per-signal heatmap, and recurring weaknesses — that aggregate evaluation data across sessions. `dashboard.repository.ts` queries the database via Prisma, while `dashboard.types.ts` defines the shaped response types (`TrendPoint`, `HeatmapCell`, `WeaknessSummary`) keyed by rubric signal and phase. All three endpoints accept an optional `rubricVersion` filter, allowing cross-session analytics to be scoped to a specific rubric.

## Module: evaluations

**Path:** `backend/src/modules/evaluations`
**Files:** 34 (16 tests)
**Key exports:** `AGENTS_CONFIG`, `BasePhaseAgent`, `BuildAgent`, `PlanAgent`, `SynthesizerAgent`, `ValidateAgent`, `WrapAgent`, `RunEvaluationDto`, +64 more
**Depends on (internal):** phase-tagger, llm, build-sessions, sessions, artifacts, hints, mentor, signal-mentor, snapshots, common, database
**Depended on by (internal):** _root, build-sessions, eval-harness, mentor, questions, sessions, signal-mentor
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`, `class-validator`

**Responsibility:** The `evaluations` module orchestrates multi-phase LLM-based scoring of user design sessions. `evaluations.module.ts` wires together a pipeline of specialized agents (`PlanAgent`, `BuildAgent`, `ValidateAgent`, `WrapAgent`, `SynthesizerAgent`) that evaluate session artifacts against a loaded rubric, compute deterministic scores, and persist results with a full LLM audit trail. `evaluations.controller.ts` exposes REST endpoints to trigger or retrieve these evaluations, while `evaluations.repository.ts` handles durable storage of phase scores, signal results, and token-level audit metadata via Prisma.

## Module: hints

**Path:** `backend/src/modules/hints`
**Files:** 7 (2 tests)
**Key exports:** `HINT_REPLY_MAX_TOKENS`, `HINT_MESSAGE_MAX_CHARS`, `SendHintDto`, `HintsController`, `HintsModule`, `HINT_SYSTEM_PROMPT`, `AIInteractionsRepository`, `HintsService`
**Depends on (internal):** llm, sessions, snapshots, database
**Depended on by (internal):** _root, evaluations
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/swagger`, `class-validator`

**Responsibility:** The `hints` module delivers a Socratic coaching chat alongside active interview sessions. `hints.service.ts` assembles the conversation history, attaches the user's current `plan.md` snapshot, and calls the LLM with `HINT_SYSTEM_PROMPT` — a system prompt that constrains the model to ask leading questions rather than give direct answers. `AIInteractionsRepository` persists each prompt-response turn to the database so the full exchange can be replayed via the `HintsController` list endpoint.

## Module: llm

**Path:** `backend/src/modules/llm`
**Files:** 13 (7 tests)
**Key exports:** `OLLAMA_REQUEST_TIMEOUT_MS`, `LLM_ENV`, `CLAUDE_CLI_TIMEOUT_MS`, `CLAUDE_CLI_DEFAULT_BIN`, `ChatRole`, `LlmModule`, `AnthropicProvider`, `ClaudeCliProvider`, +19 more
**Depends on (internal):** _none_
**Depended on by (internal):** _root, eval-harness, evaluations, hints, mentor, signal-mentor
**External:** `@nestjs/common`, `@nestjs/config`, `@anthropic-ai/sdk`, `node:child_process`

**Responsibility:** The `llm` module is a self-contained NestJS infrastructure layer that abstracts LLM provider selection and invocation behind a single `LlmService`. `llm-provider.factory.ts` selects among three concrete providers — Anthropic API, Ollama, and Claude CLI — based on environment configuration, while `llm.service.ts` wraps every provider call with per-attempt timeouts and exponential-backoff retry logic. The module is globally scoped and exports only `LlmService`, making it the sole gateway through which the rest of the backend sends chat messages to an LLM.

## Module: mentor

**Path:** `backend/src/modules/mentor`
**Files:** 8 (1 tests)
**Key exports:** `MentorAgent`, `GenerateMentorDto`, `MentorController`, `MentorModule`, `buildMentorPrompt`, `flattenForAudit`, `BuiltMentorPrompt`, `MentorRepository`, +5 more
**Depends on (internal):** evaluations, llm, phase-tagger, sessions, snapshots, database
**Depended on by (internal):** _root, eval-harness, evaluations
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`, `class-validator`, `node:fs`

**Responsibility:** The `mentor` module generates a structured, LLM-powered teaching artifact for a completed evaluation — a six-section Markdown document that translates scored signal results into pedagogical feedback tailored to the candidate's seniority and phase (plan or build). `mentor.agent.ts` drives the LLM call using a prompt built from the evaluation's signal judgments, plan.md, and cross-phase context, treating the evaluator's scores as authoritative ground truth rather than re-litigating them. `MentorController` exposes GET and POST endpoints so the frontend can trigger generation and poll for the result.

## Module: phase-tagger

**Path:** `backend/src/modules/phase-tagger`
**Files:** 3
**Key exports:** `PhaseTaggerModule`, `PhaseTaggerService`, `Phase`, `TaggedEntries`
**Depends on (internal):** artifacts
**Depended on by (internal):** _root, dashboard, eval-harness, evaluations, mentor, signal-mentor
**External:** `@nestjs/common`

**Responsibility:** `phase-tagger.service.ts` classifies artifact log entries (imported as `JsonlEntry` from the artifacts module) into one of four discrete session phases — `plan`, `build`, `validate`, or `wrap` — and groups them into a `TaggedEntries` map keyed by phase. It also exposes a time-based inference method that infers the current phase from elapsed time and recent activity. `phase-tagger.module.ts` registers and exports this service for consumption by other NestJS modules.

## Module: questions

**Path:** `backend/src/modules/questions`
**Files:** 5 (1 tests)
**Key exports:** `CreateQuestionDto`, `StartAttemptDto`, `QuestionsController`, `QuestionsModule`, `QuestionsRepository`, `QuestionsService`
**Depends on (internal):** sessions, evaluations, snapshots, common, database
**Depended on by (internal):** _root
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/config`, `@nestjs/swagger`, `class-validator`

**Responsibility:** The `questions` module manages the lifecycle of system-design interview questions and their evaluation attempts. `questions.controller.ts` exposes REST endpoints to create questions (simultaneously opening a first session), list or fetch them with their session histories, start additional attempts on existing questions (inheriting the most recent plan), and hard-delete a question with full cascading cleanup. `questions.repository.ts` handles all Prisma persistence, including flattening nested session and evaluation data for API responses.

## Module: sessions

**Path:** `backend/src/modules/sessions`
**Files:** 7 (2 tests)
**Key exports:** `CreateSessionDto`, `EndSessionDto`, `SessionEndStatus`, `SessionsController`, `SessionsRepository`, `SessionsService`, `EndSessionResult`, `RedactedSession`, +3 more
**Depends on (internal):** evaluations, common, database
**Depended on by (internal):** _root, evaluations, hints, mentor, questions, signal-mentor
**External:** `@nestjs/common`, `@prisma/client`, `class-validator`, `@nestjs/config`, `@nestjs/swagger`

**Responsibility:** The `sessions` module manages the full lifecycle of a user design-judge session: creation, retrieval, and termination. `sessions.service.ts` orchestrates the end-session flow — marking a session as completed or abandoned via the repository, then delegating to `EvaluationsService` to trigger phase evaluations when the session completes successfully. `sessions.repository.ts` handles all Prisma database operations, including stripping the `buildTokenHash` field from every returned row to prevent credential leakage.

## Module: signal-mentor

**Path:** `backend/src/modules/signal-mentor`
**Files:** 8 (2 tests)
**Key exports:** `SignalMentorAgent`, `GenerateSignalMentorDto`, `SignalMentorController`, `buildSignalMentorPrompt`, `flattenForAudit`, `buildAnnotationsTool`, `SUBMIT_ANNOTATIONS_TOOL_NAME`, `BuiltSignalMentorPrompt`, +7 more
**Depends on (internal):** evaluations, llm, phase-tagger, sessions, snapshots, database
**Depended on by (internal):** _root, eval-harness, evaluations
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/swagger`, `@prisma/client`, `class-validator`

**Responsibility:** The `signal-mentor` module generates per-signal coaching annotations for evaluations where a candidate's plan missed or incorrectly triggered rubric signals. `signal-mentor.agent.ts` drives a batched LLM call—using a tool-use schema when supported, with a JSON fallback—to produce concise, plan-specific feedback for each "gap" signal. `signal-mentor.controller.ts` exposes GET/POST endpoints so the frontend can poll for and trigger this coaching generation by evaluation ID.

## Module: snapshots

**Path:** `backend/src/modules/snapshots`
**Files:** 6 (2 tests)
**Key exports:** `CaptureSnapshotDto`, `SnapshotsController`, `SnapshotsRepository`, `SnapshotsService`, `SnapshotsModule`, `SnapshotArtifacts`
**Depends on (internal):** database
**Depended on by (internal):** _root, artifacts, evaluations, hints, mentor, questions, signal-mentor
**External:** `@nestjs/common`, `@prisma/client`, `@nestjs/swagger`, `class-transformer`, `class-validator`

**Responsibility:** The `snapshots` module persists point-in-time captures of a candidate's `plan.md` during a system-design session. `snapshots.controller.ts` exposes three HTTP endpoints — capture, latest, and list — scoped to a session, handling saves triggered by autosave, manual save, and page unload. `snapshots.repository.ts` writes and queries these records via Prisma, and the latest snapshot is also used to seed the editor on mount and seed plan content into retry sessions.

## Module: common

**Path:** `backend/src/common`
**Files:** 3 (1 tests)
**Key exports:** `ShutdownInProgressError`, `BackgroundTaskTimeoutError`, `BackgroundTaskTracker`, `TrackOptions`, `TaskFailureRecord`, `BackgroundTaskStats`, `CommonModule`, `AllExceptionsFilter`
**Depends on (internal):** _none_
**Depended on by (internal):** _root, build-sessions, evaluations, questions, sessions
**External:** `@nestjs/common`, `@nestjs/config`, `express`

**Responsibility:** The `common` module provides two cross-cutting infrastructure concerns registered globally via `common.module.ts`. `background-task-tracker.service.ts` manages fire-and-forget async work: it tracks in-flight promises, enforces per-task timeouts, counts failures, and drains cleanly on shutdown — surfacing `ShutdownInProgressError` and `BackgroundTaskTimeoutError` for deterministic error handling. `all-exceptions.filter.ts` complements this by catching all unhandled exceptions at the HTTP boundary and normalizing them into consistent JSON error responses.

## Module: config

**Path:** `backend/src/config`
**Files:** 1
**Key exports:** `default`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** The `config` module is a leaf-level configuration factory responsible for reading environment variables and supplying typed runtime settings to the rest of the application. `configuration.ts` exports a single default function that consolidates server port, database URL, Anthropic LLM parameters (API key, model, token limit), rubric version and directory, and the Claude Code projects directory into one structured object.

## Module: database

**Path:** `backend/src/database`
**Files:** 2
**Key exports:** `DatabaseModule`, `PrismaService`
**Depends on (internal):** _none_
**Depended on by (internal):** _root, artifacts, build-sessions, dashboard, evaluations, hints, mentor, questions, scripts, sessions, signal-mentor, snapshots
**External:** `@nestjs/common`, `@prisma/client`

**Responsibility:** The `database.module.ts` registers `PrismaService` as a globally available NestJS provider, making database access injectable across the entire application without per-module imports. `prisma.service.ts` wraps the Prisma ORM client and manages the connection lifecycle — opening the connection on module initialization and closing it on teardown.

## Module: _root

**Path:** `backend/src`
**Files:** 2
**Key exports:** `AppModule`
**Depends on (internal):** common, artifacts, build-sessions, dashboard, database, evaluations, hints, llm, mentor, phase-tagger, questions, sessions, signal-mentor, snapshots
**Depended on by (internal):** eval-harness, scripts
**External:** `@nestjs/common`, `@nestjs/config`, `@nestjs/core`, `@nestjs/swagger`

**Responsibility:** `app.module.ts` is the NestJS application root that wires together all feature modules — sessions, evaluations, hints, mentor, and a dozen others — into a single deployable unit. `main.ts` bootstraps the HTTP server with global validation, CORS, exception filtering, and a Swagger UI mounted at the docs endpoint. Together these two files form the composition and startup layer; they own no domain logic themselves.

## Module: eval-harness

**Path:** `backend/eval-harness`
**Files:** 5
**Key exports:** `compareResult`, `loadFixtures`, `validateAgainstRubric`, `printConsoleReport`, `writeJsonReport`, `FixtureExpectation`, `FixtureHint`, `FixtureBuildEvent`, +9 more
**Depends on (internal):** evaluations, mentor, signal-mentor, _root, llm, phase-tagger
**Depended on by (internal):** _none_
**External:** `path`, `fs`, `@nestjs/config`, `@nestjs/core`, `js-yaml`

**Responsibility:** The `eval-harness` module is a CLI test harness that runs evaluation fixtures against the backend's phase-evaluation agents and verifies their outputs. `fixture-loader.ts` reads YAML fixture definitions from disk and validates them against rubric constraints, `comparator.ts` checks whether an agent's actual score and signal results fall within the fixture's expected ranges, and `reporter.ts` renders pass/fail results to the console or a JSON file.

## Module: scripts

**Path:** `backend/scripts`
**Files:** 1
**Key exports:** _none_
**Depends on (internal):** _root, database
**Depended on by (internal):** _none_
**External:** `@nestjs/core`, `@prisma/client`

**Responsibility:** `migrate-v1-to-v2.ts` is a one-shot, idempotent data migration script that backfills existing v1.0 questions in the database to the v2.0 schema by running `classifyMode()` deterministically at migration time rather than deferring classification to evaluation. It bootstraps the full NestJS application context to access `PrismaService`, supports dry-run and single-question modes via CLI flags, and leaves historical `PhaseEvaluation` rows untouched.
