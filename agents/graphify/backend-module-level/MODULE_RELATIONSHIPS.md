# backend — module relationships

Cross-module import graph for `backend/`. Each box is a module, each arrow is "X imports from Y". Generated from `agents/codebase-map/backend.json` (no LLM calls). See `agents/graphify/build-mermaid.py`.

**15 modules · 44 cross-module edges**
**Hubs (>= 5 inbound):** `evaluations`, `sessions`, `snapshots`, `database`
**Leaves (no inbound):** `config`

```mermaid
flowchart LR
  artifacts["artifacts"]
  build_sessions["build-sessions"]
  dashboard["dashboard"]
  evaluations["evaluations"]
  hints["hints"]
  llm["llm"]
  mentor["mentor"]
  phase_tagger["phase-tagger"]
  questions["questions"]
  sessions["sessions"]
  signal_mentor["signal-mentor"]
  snapshots["snapshots"]
  common["common"]
  config["config"]
  database["database"]

  artifacts --> database
  artifacts --> snapshots
  build_sessions --> common
  build_sessions --> database
  build_sessions --> evaluations
  dashboard --> database
  dashboard --> phase_tagger
  evaluations --> artifacts
  evaluations --> build_sessions
  evaluations --> common
  evaluations --> database
  evaluations --> hints
  evaluations --> llm
  evaluations --> mentor
  evaluations --> phase_tagger
  evaluations --> sessions
  evaluations --> signal_mentor
  evaluations --> snapshots
  hints --> database
  hints --> llm
  hints --> sessions
  hints --> snapshots
  mentor --> database
  mentor --> evaluations
  mentor --> llm
  mentor --> phase_tagger
  mentor --> sessions
  mentor --> snapshots
  phase_tagger --> artifacts
  questions --> common
  questions --> database
  questions --> evaluations
  questions --> sessions
  questions --> snapshots
  sessions --> common
  sessions --> database
  sessions --> evaluations
  signal_mentor --> database
  signal_mentor --> evaluations
  signal_mentor --> llm
  signal_mentor --> phase_tagger
  signal_mentor --> sessions
  signal_mentor --> snapshots
  snapshots --> database

  classDef hub fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;
  classDef leaf fill:#dcfce7,stroke:#16a34a;
  classDef entry fill:#e0e7ff,stroke:#6366f1,stroke-dasharray:4 2;
  class evaluations,sessions,snapshots,database hub;
  class config leaf;
```

## Dependencies (text form)

| Module | Depends on | Depended on by |
|---|---|---|
| **`artifacts`** | `database`, `snapshots` | `_root`, `evaluations`, `phase-tagger` |
| **`build-sessions`** | `database`, `evaluations`, `common` | `_root`, `evaluations` |
| **`common`** | _none_ | `_root`, `build-sessions`, `evaluations`, `questions`, `sessions` |
| **`config`** | _none_ | _none_ |
| **`dashboard`** | `database`, `phase-tagger` | `_root` |
| **`database`** | _none_ | `_root`, `artifacts`, `build-sessions`, `dashboard`, `evaluations`, `hints`, `mentor`, `questions`, `scripts`, `sessions`, `signal-mentor`, `snapshots` |
| **`evaluations`** | `phase-tagger`, `llm`, `build-sessions`, `sessions`, `artifacts`, `hints`, `mentor`, `signal-mentor`, `snapshots`, `common`, `database` | `_root`, `build-sessions`, `eval-harness`, `mentor`, `questions`, `sessions`, `signal-mentor` |
| **`hints`** | `llm`, `sessions`, `snapshots`, `database` | `_root`, `evaluations` |
| **`llm`** | _none_ | `_root`, `eval-harness`, `evaluations`, `hints`, `mentor`, `signal-mentor` |
| **`mentor`** | `evaluations`, `llm`, `phase-tagger`, `sessions`, `snapshots`, `database` | `_root`, `eval-harness`, `evaluations` |
| **`phase-tagger`** | `artifacts` | `_root`, `dashboard`, `eval-harness`, `evaluations`, `mentor`, `signal-mentor` |
| **`questions`** | `sessions`, `evaluations`, `snapshots`, `common`, `database` | `_root` |
| **`sessions`** | `evaluations`, `common`, `database` | `_root`, `evaluations`, `hints`, `mentor`, `questions`, `signal-mentor` |
| **`signal-mentor`** | `evaluations`, `llm`, `phase-tagger`, `sessions`, `snapshots`, `database` | `_root`, `eval-harness`, `evaluations` |
| **`snapshots`** | `database` | `_root`, `artifacts`, `evaluations`, `hints`, `mentor`, `questions`, `signal-mentor` |
