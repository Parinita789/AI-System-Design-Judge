# cli module map

_Generated 2026-05-11T17:50:50.086Z (model: claude-sonnet-4-6)_

## Summary

- **10** modules
- **10** source files + **4** test files
- **1** modules with no inbound internal deps (entry points / leaves)

## Module: aiBuffer

**Path:** `cli/src/aiBuffer.ts`
**Files:** 1
**Key exports:** `AIBuffer`, `BufferedAITurn`
**Depends on (internal):** aiLogs
**Depended on by (internal):** api, finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** `aiBuffer.ts` implements a persistent, file-backed queue for AI conversation turns. It appends `BufferedAITurn` records (normalized turns augmented with an auto-incremented `id` and a `sent` flag) to a JSONL file, and tracks which turns have already been delivered via a separate cursor file. On startup it rehydrates both files to resume exactly where a prior session left off.

## Module: aiLogs

**Path:** `cli/src/aiLogs.ts`
**Files:** 1 (1 tests)
**Key exports:** `ClaudeCodeLogReader`, `encodedCwd`, `claudeProjectDir`, `parseClaudeCodeLine`, `TEXT_CAP`, `TOOL_INPUT_CAP`, `TOOL_RESULT_CAP`, `NormalizedAITurn`, +2 more
**Depends on (internal):** _none_
**Depended on by (internal):** aiBuffer, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** `aiLogs.ts` provides read access to Claude Code's on-disk session logs for a given working directory. It locates the correct project log folder via `claudeProjectDir`, tracks per-session byte offsets in a cursor file to enable incremental reads, and normalizes raw log lines into `NormalizedAITurn` records with capped text fields (`TEXT_CAP`, `TOOL_INPUT_CAP`, `TOOL_RESULT_CAP`) suitable for downstream consumption.

## Module: api

**Path:** `cli/src/api.ts`
**Files:** 1 (1 tests)
**Key exports:** `MentorApiClient`, `describeError`, `sendWithBackoff`, `drainBuffer`, `sendAiWithBackoff`, `drainAiBuffer`, `DEFAULT_BACKOFF_MS`, `ApiClientOptions`, +2 more
**Depends on (internal):** aiBuffer, buffer
**Depended on by (internal):** finish, watch
**External:** `axios`

**Responsibility:** `api.ts` is a network client module that wraps `axios` to communicate with a remote build server. It exposes `MentorApiClient`, which sends buffered file-change events and AI interaction turns to the server, and signals build completion. The `sendWithBackoff` and `drainBuffer` exports suggest retry logic for delivering payloads from the `buffer` and `aiBuffer` modules reliably.

## Module: buffer

**Path:** `cli/src/buffer.ts`
**Files:** 1 (1 tests)
**Key exports:** `EventBuffer`, `BufferedEvent`, `NewEvent`, `EventAction`
**Depends on (internal):** _none_
**Depended on by (internal):** api, finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** `buffer.ts` implements a persistent, file-backed queue for file-system change events. The `EventBuffer` class appends `BufferedEvent` records — each capturing a file path, an `EventAction` (`created`, `modified`, or `deleted`), optional content or diff, and a sent flag — to a JSONL log on disk. A separate cursor file tracks which events have already been delivered, allowing unsent events to survive process restarts.

## Module: config

**Path:** `cli/src/config.ts`
**Files:** 1
**Key exports:** `writeSession`, `readSession`, `writeState`, `readState`, `configDir`, `SessionConfig`, `RuntimeState`
**Depends on (internal):** _none_
**Depended on by (internal):** finish, status, watch
**External:** `node:fs`, `node:os`, `node:path`

**Responsibility:** `config.ts` manages persistent CLI state by reading and writing two JSON files — a session file (storing authentication token and server URL) and a state file (tracking flush history and start time) — both stored under a `.mentor` directory in the user's home folder. It is a leaf module with no internal dependencies, serving as the single source of truth for session credentials and runtime state across CLI invocations.

## Module: diff

**Path:** `cli/src/diff.ts`
**Files:** 1 (1 tests)
**Key exports:** `isNoopOutcome`, `isLikelyBinary`, `shouldRebaseline`, `computeChange`, `PrevState`, `DiffOutcome`
**Depends on (internal):** _none_
**Depended on by (internal):** watch
**External:** `diff`

**Responsibility:** `diff.ts` computes and classifies file-content changes between a previously captured state and new content. It produces a `DiffOutcome` describing whether a file was created or modified, carrying either a unified diff patch (via the `diff` package's `createPatch`) or a full content snapshot when the baseline is stale, the diff is large, or the content appears binary. The `shouldRebaseline` logic controls when incremental diffing is abandoned in favor of a fresh full-content capture.

## Module: finish

**Path:** `cli/src/finish.ts`
**Files:** 1
**Key exports:** `runFinish`, `FinishOptions`
**Depends on (internal):** aiBuffer, api, buffer, config
**Depended on by (internal):** index
**External:** `chalk`

**Responsibility:** `finish.ts` implements the CLI's session-teardown command. When invoked, `runFinish` reads the active session, drains any buffered events and AI buffer entries to the remote server in batches, then calls `api.finishBuild()` to signal completion. It reports partial-flush warnings via `chalk` if any events remain unsent.

## Module: index

**Path:** `cli/src/index.ts`
**Files:** 1
**Key exports:** _none_
**Depends on (internal):** finish, status, watch
**Depended on by (internal):** _none_
**External:** `commander`

**Responsibility:** `index.ts` is the CLI entry point for the `mentor` tool. It uses `commander` to declare and validate three subcommands — `watch`, `finish`, and `status` — delegating actual execution to the `runWatch`, `runFinish`, and `runStatus` handlers imported from the respective internal modules. It also performs upfront argument validation (duration bounds, ISO8601 timestamp format) before handing off to those handlers.

## Module: status

**Path:** `cli/src/status.ts`
**Files:** 1
**Key exports:** `runStatus`
**Depends on (internal):** aiBuffer, buffer, config
**Depended on by (internal):** index
**External:** `chalk`

**Responsibility:** `status.ts` implements the `runStatus` command, which prints a formatted local diagnostic snapshot of the mentor CLI to stdout. It reads session credentials, server info, and runtime state from `config`, then queries both `buffer` and `aiBuffer` for pending-event counts, displaying flush health and authentication details (with token redaction) via `chalk`-coloured output.

## Module: watch

**Path:** `cli/src/watch.ts`
**Files:** 1
**Key exports:** `runWatch`, `WatchOptions`
**Depends on (internal):** aiBuffer, aiLogs, api, buffer, config, diff
**Depended on by (internal):** index
**External:** `chalk`, `chokidar`, `ignore`, `node:fs`, `node:path`

**Responsibility:** `watch.ts` is the file-watching entry point for the CLI. It uses `chokidar` to monitor a working directory for filesystem changes, buffers those events via `EventBuffer` and `AIBuffer`, and periodically flushes them to a remote API using `sendWithBackoff` and `sendAiWithBackoff`. It also tracks session state and elapsed time, and optionally captures AI log output alongside file-change events.
