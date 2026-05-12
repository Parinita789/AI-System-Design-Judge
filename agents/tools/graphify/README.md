# agents/tools/graphify/

[graphify](https://www.npmjs.com/search?q=graphify)-based code knowledge
graph builders for this monorepo. Seven Python scripts that turn
graphify's raw output (and the mapper's per-package JSON) into views
that are actually browsable. All output lands under
`agents/data/knowledge-graphs/`.

Companion to [`agents/packages/mapper/`](../../packages/mapper/) and
[`agents/data/codebase-map/`](../../data/codebase-map/): the mapper
gives you plain-English module summaries; graphify gives you the graph
structure underneath them.

## TL;DR

```bash
# One module, end-to-end (extract + flatten + high-level view)
agents/tools/graphify/map-module.sh evaluations

# Build the package-wide module-relationship views (free; no LLM)
agents/tools/graphify/build-mermaid.py backend          # static Mermaid for GitHub/PRs
agents/tools/graphify/build-neighborhoods.py backend    # per-module 1-hop neighborhoods
agents/tools/graphify/build-explorer.py backend         # ← click-around HTML, the daily-driver

open agents/data/knowledge-graphs/backend-module-level/MODULE_EXPLORER.html
```

## Layout

```
agents/data/knowledge-graphs/
  # Tooling (committed)
  *.py *.sh README.md .gitignore

  # Per-module graphify extractions (gitignored — regenerable)
  <module-name>/
    graphify-out/                          ← graphify's outputs
      graph.json                             symbol-level graph
      graph.html                             force-directed viz (busy)
      GRAPH_REPORT.md                        text summary: hubs, cycles, gaps
      GRAPH_TREE.html                        D3 tree, full symbol detail
      manifest.json, .graphify_*.json        cache + analysis state
      # written by flatten.py:
      graph.file-level.json                  ← filtered: files only
      GRAPH_TREE_files.html                  ← clean file-level tree
      graph.high-level.json                  ← filtered: behavioral files
      GRAPH_TREE_high-level.html             ← cleanest single-module view
    # written by build-neighborhoods.py (gitignored):
    MODULE_NEIGHBORHOOD.{md,html}            ← this module + 1-hop neighbors

  # Per-package views (the *.md files committed, *.html gitignored)
  <package>-module-level/
    MODULE_RELATIONSHIPS.md                  ← committed: Mermaid + table
    MODULE_RELATIONSHIPS.html                  rendered companion
    MODULE_RELATIONSHIPS_features-only.md    ← committed: drops infra
    MODULE_RELATIONSHIPS_features-only.html
    MODULE_EXPLORER.html                     ← click-to-navigate explorer
    graphify-out/graph.json                    module-level graph data
    graphify-out/GRAPH_TREE_module-level.html

  # Per-package unified file-level tree (gitignored)
  <package>-unified/graphify-out/
    GRAPH_TREE_unified-high.html             ← all modules' files in one tree
```

## The seven scripts

| Script | Reads | Writes | LLM? |
|---|---|---|---|
| `map-module.sh <module>` | `backend/src/...` | extract → flatten → high-level | yes (graphify extract) |
| `flatten.py <dir>` | `<dir>/graphify-out/graph.json` | `graph.{file,high}-level.json`, `GRAPH_TREE_*.html` | no |
| `build-mermaid.py <pkg>` | `agents/data/codebase-map/<pkg>.json` | `<pkg>-module-level/MODULE_RELATIONSHIPS.{md,html}` | no |
| `build-neighborhoods.py <pkg>` | `agents/data/codebase-map/<pkg>.json` | per-module `MODULE_NEIGHBORHOOD.{md,html}` | no |
| `build-explorer.py <pkg>` | `agents/data/codebase-map/<pkg>.json` | `<pkg>-module-level/MODULE_EXPLORER.html` | no |
| `build-module-level.py <json> <dir>` | mapper JSON | one-node-per-module tree HTML | no |
| `build-unified.py <pkg>` | per-module graphs + mapper JSON | `<pkg>-unified/.../GRAPH_TREE_unified-*.html` | no |

Only `map-module.sh` calls `graphify extract` (which uses an LLM).
Everything else operates on already-extracted data + the free mapper
output, and costs nothing to re-run.

## Daily workflow

### "I want the architectural overview of a package"

```bash
agents/tools/graphify/build-explorer.py backend
open agents/data/knowledge-graphs/backend-module-level/MODULE_EXPLORER.html
```

Sidebar lists every module (hubs marked yellow, leaves green). Click
to focus; click any node in the diagram to jump to that module's
view. URL hash sticks for deep links: `MODULE_EXPLORER.html#evaluations`.

### "I want to read this in a PR / on GitHub"

```bash
agents/tools/graphify/build-mermaid.py backend
open agents/data/knowledge-graphs/backend-module-level/MODULE_RELATIONSHIPS.md
```

The `.md` file is a Mermaid flowchart + a dependency table. GitHub,
VS Code, and most other markdown renderers display the diagram
inline.

### "I want to understand one specific module deeply"

```bash
agents/tools/graphify/map-module.sh evaluations
# Then open ONE of:
open agents/data/knowledge-graphs/evaluations/graphify-out/GRAPH_TREE_high-level.html  # behavioral files
open agents/data/knowledge-graphs/evaluations/graphify-out/GRAPH_TREE_files.html       # all files
open agents/data/knowledge-graphs/evaluations/graphify-out/GRAPH_REPORT.md             # text summary
```

`map-module.sh` runs extract + both flattens for you. The high-level
view is the cleanest first read — only `*.module.ts`, `*.controller.ts`,
`*.service.ts`, `*.repository.ts`, `*.provider.ts`, `*.agent.ts`,
`*.guard.ts`, `*.factory.ts`, `*.handler.ts`.

### "I want every module's neighborhood as separate files"

```bash
agents/tools/graphify/build-neighborhoods.py backend
# Then for any module:
open agents/data/knowledge-graphs/evaluations/MODULE_NEIGHBORHOOD.html
```

The explorer subsumes these; standalone neighborhoods are useful
only when you want a single deep-linkable URL for one module.

### "I want all modules' files in one searchable tree"

```bash
agents/tools/graphify/build-unified.py backend --level high
open agents/data/knowledge-graphs/backend-unified/graphify-out/GRAPH_TREE_unified-high.html
```

110 nodes (file-level) or 66 nodes (high-level) across all 11 modules
in a single D3 tree with cross-module edges from the mapper data.

## Choosing the right view

| Question | Open this |
|---|---|
| Show me the whole package shape | `<pkg>-module-level/MODULE_EXPLORER.html` |
| Snapshot for a PR/issue | `<pkg>-module-level/MODULE_RELATIONSHIPS.md` |
| What does THIS module touch? | `MODULE_EXPLORER.html#<module>` |
| What's inside this module? | `<module>/graphify-out/GRAPH_TREE_high-level.html` |
| Who depends on this hub? Cycles? Isolates? | `<module>/graphify-out/GRAPH_REPORT.md` |
| Plain-English summary | `agents/data/codebase-map/<pkg>.md` |
| Symbol-level raw graph | `<module>/graphify-out/graph.json` |
| Force-directed viz | `<module>/graphify-out/graph.html` (usually a hairball — skip) |

## Common flags

Most scripts accept the same shape filters:

```
--include-entry    Keep _root, eval-harness, scripts. Default drops them
                   (they import every module by design, add nothing but
                   spaghetti to the diagram).

--include-infra    Keep database, common, config as neighbors. Default
                   drops them (they're touched by everyone, crowd every
                   diagram with a useless leaf).

--high-level       (flatten.py only) Filter to behavioral files only.

--include-tests    (flatten.py only) Keep *.test.* and *.spec.* files.

--level high|file  (build-unified.py only) Granularity inside each module.

--layout LR|TD     (build-mermaid.py only) Mermaid flowchart direction.
```

The behavioral file suffixes are hard-coded at the top of `flatten.py`
as `HIGH_LEVEL_SUFFIXES`. Edit that tuple if your module uses a
convention not in: `.module.ts`, `.controller.ts`, `.service.ts`,
`.repository.ts`, `.provider.ts`, `.agent.ts`, `.guard.ts`,
`.factory.ts`, `.handler.ts`.

## What's mine vs graphify's

Only `graphify extract` and `graphify tree` are graphify itself.
Everything in this directory's seven scripts is bookkeeping on top:

- **filtering** symbol-level → file-level → behavioral-files-only
- **bucketing** modules into hubs / leaves / entry points for styling
- **post-processing** the rendered HTML with smaller header + button CSS
- **lazy mermaid rendering** in the explorer so all 12+ diagrams in
  one HTML render correctly (graphify-tree-on-hidden-elements doesn't
  work because Mermaid measures DOM dimensions at render time)
- **synthesizing cross-module edges** in `build-unified.py` and
  `build-mermaid.py` from the mapper's already-computed
  `internalDepsOut` / `internalDepsIn` (the per-module graphify
  extracts can't see these — they're scoped to one module's path).

## What's gitignored vs committed

Tracked under `agents/data/knowledge-graphs/`:

- `*.py`, `*.sh`, `README.md`, `.gitignore` — the tooling
- `<package>-module-level/MODULE_RELATIONSHIPS*.md` — text Mermaid
  diagrams, readable on GitHub and in PR diffs

Gitignored (regenerable from the scripts above):

- Everything under `<module>/` (graphify-out + neighborhood files)
- All `.html` files (rendered companions of the `.md`)
- All `*-unified/` and `backend-all/` experimental dirs
- `agents/data/codebase-map/*.json` (mapper JSON sidecars)

See the root `.gitignore` for the exact rules.

## Cost notes

| Action | Cost | Time |
|---|---|---|
| `graphify extract` one small module (5–10 files) | ~$0.30–$0.80 | 45–90s |
| `graphify extract` one medium module (10–20 files) | ~$1–2 | 2–3min |
| `graphify extract` evaluations (50 files) | ~$5–10 | 5–10min |
| All other scripts (`flatten`, `build-*`, `explorer`) | free | seconds |

`graphify update <path>` re-extracts code structure *without* an LLM
pass — useful for refreshing the structural data after edits if you
don't need fresh semantic clustering.

`agents/tools/graphify/map-module.sh` is the convenience wrapper: extract
+ flatten + high-level in one command. It auto-resolves whether the
module lives under `backend/src/modules/<x>`, `backend/src/<x>`, or
`backend/<x>` (eval-harness, scripts).

## Requirements

- `claude` binary on `PATH` (for `graphify extract --backend claude`)
- Python 3.9+ (for the helper scripts)
- A previously-run mapper output at `agents/data/codebase-map/<package>.json`
  for any of the `build-*.py` scripts. Regenerate with:
  ```bash
  node agents/packages/mapper/dist/index.js --no-with-llm --json \
    --package=<pkg> --repo-root <repo-root>
  ```
