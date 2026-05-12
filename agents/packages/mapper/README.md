# codebase-mapper

LLM-driven agent that builds a structural map of this monorepo: every
module across `backend/`, `frontend/`, and `cli/`, with each module's
file count, key exports, within-package dependencies, top external
npm dependencies, and a 2–3 sentence inferred responsibility.

This is the foundation for future agents (critique, recommendation).
Today's deliverable is descriptive, not prescriptive — it reports
what's there, not what's wrong.

## Install

This package isn't published. Use `npm link` like the `cli/` package:

```
cd agents/packages/mapper
npm install
npm run build
npm link
```

`codebase-mapper` is now on your PATH.

## Usage

```
codebase-mapper [--package=backend|frontend|cli|all]
                [--output=<dir>]
                [--with-llm | --no-with-llm]
                [--json]
                [--model=<name>]
                [--provider=auto|anthropic|claude-cli]
                [--list-modules]
```

### Defaults

- `--package=all` — map all three packages.
- `--output=./agents/data/codebase-map` — writes per-package markdown
  plus an `index.md` to `<repo>/agents/data/codebase-map/` (peer of
  this package).
- `--with-llm=true` — opt out via `--no-with-llm` for a fast
  structural-only run during dev.
- `--json=false` — emit the per-package JSON sidecar only on
  request.
- `--model=claude-sonnet-4-6` — override via `LLM_MODEL` env or
  `--model=...`. Sonnet is plenty for the descriptive synthesis;
  the structural map is what matters.

`--list-modules` bypasses everything and prints the discovered
module list to stdout — cheap dev sanity check.

## Output shape

```
agents/data/codebase-map/
  index.md          — cross-links + overall stats
  backend.md        — ~18 module sections
  frontend.md       — ~22 module sections
  cli.md            — ~10 module sections
  *.json            — optional sidecar (only with --json)
```

Each module section has structural facts (path, file count, key
exports, internal deps in/out, top external npm packages) plus —
unless `--no-with-llm` — a short responsibility paragraph that
cites at least one supplied file by name.

## Cost

Roughly **$0.12** per full run at `claude-sonnet-4-6` list pricing
(~54 modules × ~3k input tokens with prompt caching + ~120 output
tokens each). Re-runs are cheaper because the system prompt cache
hits.

## Out of scope (v1)

- Critique / scoring / recommendations. Pure description.
- Cross-package HTTP dependency tracking (frontend → backend, cli →
  backend). v2.
- Visual graph rendering (mermaid / graphviz). Markdown lists only.
- Watch / incremental mode. Full re-scan each invocation.
- Integration with the backend Nest app. This package is
  freestanding; it only reads files from disk + calls the
  Anthropic API.

## Providers

`--provider=auto` (default) picks based on what's available:

- `ANTHROPIC_API_KEY` is set → Anthropic SDK
- otherwise, `claude` is on PATH → Claude CLI mode (spawns
  `claude -p --output-format json` for each module)
- neither → error

Force a specific provider with `--provider=anthropic` or
`--provider=claude-cli`. The cost/performance characteristics:

| | Anthropic SDK | Claude CLI |
|---|---|---|
| Auth | `ANTHROPIC_API_KEY` env | Whatever the `claude` binary uses (subscription / OAuth) |
| Per-call latency | ~1–2s | ~3–5s (process spawn overhead) |
| Prompt caching | `cache_control: ephemeral` on system block | depends on the CLI's own behavior |
| Failure isolation | Per-call retries + concurrency cap | Per-call exit code + concurrency cap |

Both providers honor the same 3-concurrent-request semaphore.

## Requirements

- Node 18+
- One of:
  - `ANTHROPIC_API_KEY` for SDK mode, OR
  - `claude` binary on PATH for CLI mode (this is the same binary
    the backend uses in `claude_cli` provider mode).
- For a key-less / CLI-less run, use `--no-with-llm` to get a
  fully usable structural-only map.
