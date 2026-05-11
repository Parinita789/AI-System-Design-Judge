# frontend module map

_Generated 2026-05-11T17:50:50.086Z (model: claude-sonnet-4-6)_

## Summary

- **22** modules
- **37** source files + **0** test files
- **20** modules with no inbound internal deps (entry points / leaves)
- **1** module(s) responsibility paragraph carries an unverified citation

## Module: pages/ActiveSession

**Path:** `frontend/src/pages/ActiveSession`
**Files:** 1
**Key exports:** `ActiveSessionPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/services`, `@/components`, `@/store`, `@monaco-editor/react`, `@tanstack/react-query`

**Responsibility:** `ActiveSessionPage.tsx` is the single-screen component that drives an active system-design session end-to-end. It hosts a Monaco code editor with edit/split/preview view modes, auto-saves content on a five-minute interval, and tracks elapsed and paused time via the session store. A resizable `HintChatPanel` and `MermaidBlock` are embedded alongside React Query calls to the sessions and snapshots services for loading and persisting session state.

## Module: pages/QuestionDetail

**Path:** `frontend/src/pages/QuestionDetail`
**Files:** 1
**Key exports:** `QuestionRedirectPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/lib`, `@/services`, `@/store`, `@/types`, `@tanstack/react-query`

**Responsibility:** `QuestionRedirectPage` serves as a smart routing hub for a single question: it fetches the question's session history and immediately redirects the user to the appropriate destination — an active session if one exists, the most recent completed session otherwise, or a new attempt started via `questionsService.startAttempt`. It has no UI of its own; its sole purpose is to inspect session state and navigate accordingly.

## Module: pages/SessionResults

**Path:** `frontend/src/pages/SessionResults`
**Files:** 1
**Key exports:** `SessionResultsPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/services`, `@/components`, `@/types`, `@/lib`, `@/store`

**Responsibility:** `SessionResultsPage.tsx` renders the full results view for a completed design-interview session, displaying per-signal evaluation outcomes (hit/partial/miss), rubric weight tiers, score breakdowns, mentor feedback, and LLM cost and latency metadata. It orchestrates data fetching across sessions, questions, snapshots, evaluations, rubrics, and mentor services, composing that data into a unified read-only results page for the candidate.

## Module: pages/SessionStart

**Path:** `frontend/src/pages/SessionStart`
**Files:** 1
**Key exports:** `SessionStartPage`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `@/services`, `@/store`, `@/types`, `@tanstack/react-query`, `react`

**Responsibility:** `SessionStartPage.tsx` is the entry-point UI for creating a new evaluation session. It collects a problem prompt and seniority level from the user, automatically classifies the question kind (`traditional_design`, `agentic_design`, or `agentic_build`) via regex heuristics while allowing manual override, then submits the session via `questionsService.create` and navigates to the active session view on success.

## Module: services/api

**Path:** `frontend/src/services/api.ts`
**Files:** 1
**Key exports:** `api`
**Depends on (internal):** _none_
**Depended on by (internal):** services/buildSessions, services/dashboard, services/evaluations, services/hints, services/mentor, services/questions, services/rubrics, services/sessions, services/signalMentor, services/snapshots
**External:** `axios`

**Responsibility:** `api.ts` exports a pre-configured Axios instance with a base URL resolved from the `VITE_API_BASE_URL` environment variable and a JSON content type header, serving as the single shared HTTP client for all backend communication in the frontend application.

## Module: services/buildSessions

**Path:** `frontend/src/services/buildSessions.service.ts`
**Files:** 1
**Key exports:** `buildSessionsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `buildSessions.service.ts` provides the client-side HTTP interface for build session operations, exposing two methods: one to trigger a build for a given session (returning a minted build token) and one to retrieve a summary of build events for that session. It delegates all HTTP transport to the shared `api` module and surfaces typed responses using `BuildEventsSummary` and `MintedBuildToken` from the project's type definitions.

## Module: services/dashboard

**Path:** `frontend/src/services/dashboard.service.ts`
**Files:** 1
**Key exports:** `dashboardService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `dashboard.service.ts` is a thin HTTP client layer that fetches analytics data for the dashboard UI. It exposes three typed methods — `trend`, `heatmap`, and `weaknesses` — each making a GET request to a corresponding backend endpoint with an optional `rubricVersion` filter and returning the unwrapped response data.

## Module: services/evaluations

**Path:** `frontend/src/services/evaluations.service.ts`
**Files:** 1
**Key exports:** `evaluationsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `evaluations.service.ts` is the frontend data-access layer for evaluation operations. It exposes `evaluationsService`, a thin wrapper over the `api` client that covers four HTTP calls: triggering an evaluation run for a session, listing all evaluations for a session, fetching a single evaluation by ID, and retrieving its audit record.

## Module: services/hints

**Path:** `frontend/src/services/hints.service.ts`
**Files:** 1
**Key exports:** `hintsService`, `AIInteraction`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** `hints.service.ts` provides the client-side interface for sending hint requests to and retrieving past AI interactions from a given session. It wraps two REST calls via the `api` dependency and surfaces the `AIInteraction` shape, which captures prompt/response pairs along with token usage and timing metadata.

## Module: services/mentor

**Path:** `frontend/src/services/mentor.service.ts`
**Files:** 1
**Key exports:** `mentorService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `mentor.service.ts` exposes `mentorService`, a thin HTTP client that retrieves and generates mentor artifacts for a given evaluation. It issues GET and POST requests to the mentor API endpoint, optionally accepting a model override and an `AbortSignal` for cancellation on the POST path. Returned responses are typed as `MentorArtifactRow`.

## Module: services/questions

**Path:** `frontend/src/services/questions.service.ts`
**Files:** 1
**Key exports:** `questionsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `questions.service.ts` is the frontend data-access layer for the questions resource, wrapping the shared `api` client to expose typed CRUD operations — create, list, get, and delete — as well as a `startAttempt` method that opens a new evaluation session for a given question.

## Module: services/rubrics

**Path:** `frontend/src/services/rubrics.service.ts`
**Files:** 1
**Key exports:** `rubricsService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `rubricsService` wraps a single HTTP GET request to fetch a versioned, phase-scoped rubric from the backend API. It accepts optional `QuestionKind` and `Seniority` filters, forwarding them as query parameters. The module's sole responsibility is providing the frontend with typed `Rubric` data for a given version and phase combination.

## Module: services/sessions

**Path:** `frontend/src/services/sessions.service.ts`
**Files:** 1
**Key exports:** `sessionsService`, `EndSessionResult`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `sessions.service.ts` is a thin HTTP client facade for the sessions REST API. It exposes four operations — list all sessions, fetch a single `SessionWithQuestion`, delete a session, and end a session with a completion status — each delegating to the shared `api` instance and unwrapping the response data. The `EndSessionResult` export captures the composite payload returned when a session concludes, bundling the updated session, its phase evaluations, and any evaluation error.

## Module: services/signalMentor

**Path:** `frontend/src/services/signalMentor.service.ts`
**Files:** 1
**Key exports:** `signalMentorService`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** `@/types`

**Responsibility:** `signalMentor.service.ts` provides the client-side data-access layer for the Signal Mentor feature by exposing two HTTP operations through `signalMentorService`: fetching an existing artifact for a given evaluation ID and triggering generation of a new one, with optional model selection and request cancellation via `AbortSignal`. It delegates all HTTP transport to the shared `api` service and types its responses with `SignalMentorArtifactRow`.

## Module: services/snapshots

**Path:** `frontend/src/services/snapshots.service.ts`
**Files:** 1
**Key exports:** `snapshotsService`, `SnapshotArtifacts`, `Snapshot`
**Depends on (internal):** services/api
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** `snapshots.service.ts` provides the client-side data layer for session snapshots, exposing three operations via `snapshotsService`: capturing a new snapshot (with optional plan markdown and elapsed time), retrieving the most recent snapshot, and listing all snapshots for a given session. Each snapshot bundles structured artifacts — plan markdown, code files, a git log, and JSONL entries — alongside metadata like inferred phase and elapsed minutes. All calls are delegated to the shared `api` HTTP client.

## Module: components

**Path:** `frontend/src/components`
**Files:** 7
**Key exports:** `BuildPhaseSection`, `HintChatPanel`, `AppLayout`, `MarkdownView`, `MARKDOWN_COMPONENTS`, `MentorArtifactView`, `MermaidBlock`, `ScoreBreakdown`, +1 more
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `react`, `@/types`, `@/services`, `@tanstack/react-query`, `@/lib`

**Responsibility:** The `components` module provides the complete set of React UI building blocks for the frontend. `BuildPhaseSection.tsx` manages the build lifecycle for a session — starting builds, polling for progress, and displaying outcomes. `HintChatPanel.tsx` renders an expandable conversational interface for requesting and viewing hints. Supporting components handle app chrome (`AppLayout`), rich markdown and Mermaid diagram rendering (`MarkdownView`, `MentorArtifactView`), and structured score display (`ScoreBreakdown`).

## Module: hooks

**Path:** `frontend/src/hooks`
**Files:** 1
**Key exports:** `useSnapshotTimer`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `react`

**Responsibility:** The `hooks` module provides a single React hook, `useSnapshotTimer`, that manages a repeating 5-minute timer tied to a session lifecycle. It accepts a session ID and a callback, wiring up and tearing down the interval via React's `useEffect`. The module exposes the interval duration (`intervalMs`) to callers.

## Module: lib

**Path:** `frontend/src/lib`
**Files:** 2
**Key exports:** `extractApiError`, `computeCostUsd`, `formatCostUsd`, `formatLatency`, `CostInputs`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** The `lib` module is a shared utility layer for the frontend, providing pure functions with no dependencies on other local modules. `llm-cost.ts` encodes per-model token pricing and exposes `computeCostUsd` and `formatCostUsd` to calculate and display LLM inference costs, along with `formatLatency` for human-readable timing values. `error.ts` contributes `extractApiError`, which normalizes heterogeneous HTTP and runtime error shapes into a single display string.

## Module: store

**Path:** `frontend/src/store`
**Files:** 1
**Key exports:** `computeElapsedMs`, `useSessionStore`
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** `zustand`

**Responsibility:** `sessionStore.ts` manages client-side state for active evaluation sessions using Zustand with persistence. It tracks which session is currently active, maintains per-session pause/resume timing by accumulating elapsed milliseconds across run segments, and exposes `useSessionStore` alongside the `computeElapsedMs` utility for components that need to display live elapsed time.

## Module: types

**Path:** `frontend/src/types`
**Files:** 8
**Key exports:** `MintedBuildToken`, `BuildEventsPerFile`, `BuildEventsSummary`, `TrendPoint`, `HeatmapCell`, `WeaknessSummary`, `SignalResult`, `PhaseEvaluation`, +27 more
**Depends on (internal):** _none_
**Depended on by (internal):** _none_
**External:** _none_

**Responsibility:** The `types` module is a pure leaf-level contract layer that defines every shared TypeScript interface and union type consumed by the frontend. `rubric.ts` captures the full shape of evaluation rubrics — signals, scoring anchors, pass bars, and weight tiers — while `evaluation.ts` and `buildEvent.ts` define the runtime data structures for phase-level scoring results and build-session telemetry respectively. All eight files are import-only with no internal dependencies, making this the single authoritative source of type contracts across the frontend.

## Module: routes

**Path:** `frontend/src/routes`
**Files:** 1
**Key exports:** `router`
**Depends on (internal):** _none_
**Depended on by (internal):** _root
**External:** `@components/layout`, `@pages/ActiveSession`, `@pages/QuestionDetail`, `@pages/SessionResults`, `@pages/SessionStart`

**Responsibility:** _(unverified citation)_ The `routes` module defines the client-side URL structure for the entire frontend application. `router.tsx` exports a single `createBrowserRouter` instance that maps four URL patterns — home, question detail, active session, and session results — as nested children under a shared `AppLayout` shell. The root path redirects to `/home`, making this module the authoritative entry point for all page-level navigation.

## Module: _root

**Path:** `frontend/src`
**Files:** 2
**Key exports:** _none_
**Depends on (internal):** routes
**Depended on by (internal):** _none_
**External:** `@tanstack/react-query`, `react`, `react-dom`, `react-router-dom`

**Responsibility:** `main.tsx` is the application entry point: it mounts the React tree into the DOM, wraps it with a `QueryClient` for server-state management via TanStack Query, and delegates all routing to the `RouterProvider` supplied by the `routes` module. `vite-env.d.ts` adds Vite's client-side type declarations to the TypeScript environment.
