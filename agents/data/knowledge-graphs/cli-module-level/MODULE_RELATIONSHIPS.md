# cli — module relationships

Cross-module import graph for `cli/`. Each box is a module, each arrow is "X imports from Y". Generated from `agents/codebase-map/cli.json` (no LLM calls). See `agents/graphify/build-mermaid.py`.

**10 modules · 19 cross-module edges**
**Leaves (no inbound):** `index`

```mermaid
flowchart LR
  aiBuffer["aiBuffer"]
  aiLogs["aiLogs"]
  api["api"]
  buffer["buffer"]
  config["config"]
  diff["diff"]
  finish["finish"]
  index["index"]
  status["status"]
  watch["watch"]

  aiBuffer --> aiLogs
  api --> aiBuffer
  api --> buffer
  finish --> aiBuffer
  finish --> api
  finish --> buffer
  finish --> config
  index --> finish
  index --> status
  index --> watch
  status --> aiBuffer
  status --> buffer
  status --> config
  watch --> aiBuffer
  watch --> aiLogs
  watch --> api
  watch --> buffer
  watch --> config
  watch --> diff

  classDef hub fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;
  classDef leaf fill:#dcfce7,stroke:#16a34a;
  classDef entry fill:#e0e7ff,stroke:#6366f1,stroke-dasharray:4 2;
  class index leaf;
```

## Dependencies (text form)

| Module | Depends on | Depended on by |
|---|---|---|
| **`aiBuffer`** | `aiLogs` | `api`, `finish`, `status`, `watch` |
| **`aiLogs`** | _none_ | `aiBuffer`, `watch` |
| **`api`** | `aiBuffer`, `buffer` | `finish`, `watch` |
| **`buffer`** | _none_ | `api`, `finish`, `status`, `watch` |
| **`config`** | _none_ | `finish`, `status`, `watch` |
| **`diff`** | _none_ | `watch` |
| **`finish`** | `aiBuffer`, `api`, `buffer`, `config` | `index` |
| **`index`** | `finish`, `status`, `watch` | _none_ |
| **`status`** | `aiBuffer`, `buffer`, `config` | `index` |
| **`watch`** | `aiBuffer`, `aiLogs`, `api`, `buffer`, `config`, `diff` | `index` |
