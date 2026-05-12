# codebase-critic

LLM-driven code review agent. Consumes the mapper output
(`agents/codebase-map/*.json`), the architecture / schema / api-flow
artifacts, and the source itself, then emits:

- per-module reviews under `agents/critic-out/per-module/<package>__<id>.md`
- a single synthesis report at `agents/critic-out/synthesis.md`
- a cross-run issue tracker at `agents/critic-out/issues.json`

## How it works

Three LLM tiers:

1. **Per-file review.** Every `.ts`/`.tsx` source file is sent to
   Claude with the active **persona** (e.g. `staff-engineer`,
   `security-auditor`), the **rubric** (`rubric.md`), and the file's
   structural context (module id, deps in/out, responsibility
   paragraph from the mapper). Returns strengths, concerns, issues
   (file/line refs), and prioritized recommendations.
2. **Module rollup.** Per-module aggregation pass that takes the
   file-level JSON results plus module-level facts and produces a
   module-level review with cross-file patterns.
3. **Global synthesis.** One call that takes the architecture
   diagrams, schema, condensed api-flow, module relationship graphs,
   and all 50 module reviews. Produces an overall grade + narrative,
   top risks / strengths, cross-cutting patterns, and a
   high-priority items table.

Each issue gets a stable id (hash of file + axis + fingerprint), and
`issues.json` is reconciled run-over-run so you can see what's new,
what's still open, and what got fixed.

## Install

```
cd agents/critic
npm install
npm run build
npm link
```

## Usage

```
codebase-critic --lens=staff-engineer
codebase-critic --package=cli --skip-synthesis
codebase-critic --module=hints --max-files=3 --skip-synthesis
codebase-critic diff
```

Provider selection mirrors the mapper: `--provider=auto` (default)
uses the Anthropic SDK if `ANTHROPIC_API_KEY` is set, otherwise falls
back to the `claude` CLI.

## Cost

At Sonnet 4.6 list pricing, a full run over backend + frontend + cli
costs roughly **$4.20**. Re-runs hit warm prompt caches and drop to
about **$2.50**. The `diff` subcommand makes no LLM calls.
