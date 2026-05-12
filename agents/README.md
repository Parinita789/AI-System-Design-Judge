# agents/

Static-analysis + code-review tooling for this monorepo. Three top-
level subdirectories keep code and generated artifacts separated:

```
agents/
  HUB.html                            single-page entry point (generated)

  packages/                           runnable agent code (TypeScript)
    mapper/                             codebase-mapper — LLM module summaries
    critic/                             codebase-critic — 3-tier code review
    api-flow/                           static API call-tree extractor

  tools/                              one-shot build scripts (Python + shell)
    build-architecture.py               system + lifecycle Mermaid diagrams
    build-schema-diagram.py             Prisma → ER diagram
    build-hub.py                        regenerate HUB.html from data/
    graphify/                           graphify wrappers (per-module + unified)
      build-mermaid.py
      build-explorer.py
      build-module-level.py
      build-neighborhoods.py
      build-unified.py
      build-api-explorer.py
      flatten.py
      map-module.sh

  data/                               everything generated
    architecture/                       system + lifecycle diagrams
    schema/                             Prisma ER diagram
    codebase-map/                       mapper output + backend-api-flow.json
    knowledge-graphs/                   graphify outputs (per-module + per-pkg)
    critic-out/                         critic reviews (gitignored)
```

The rule is straightforward: `packages/` is what you run, `tools/`
is what you run when you want to regenerate static artifacts, and
`data/` is what gets generated. Nothing in `data/` is hand-written;
every file there can be regenerated from `packages/` or `tools/`
output.

## Common workflows

Refresh the structural map first; everything else depends on it:

```bash
node agents/packages/mapper/dist/index.js --json
cd agents/packages/api-flow && npm run extract && cd -
```

Build the static diagrams:

```bash
python3 agents/tools/build-architecture.py
python3 agents/tools/build-schema-diagram.py
python3 agents/tools/graphify/build-mermaid.py backend
python3 agents/tools/graphify/build-explorer.py backend
python3 agents/tools/graphify/build-api-explorer.py
python3 agents/tools/build-hub.py
```

Run a code review:

```bash
node agents/packages/critic/dist/index.js review --lens=staff-engineer
```

Open `agents/HUB.html` in a browser to navigate everything.
