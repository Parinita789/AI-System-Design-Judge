# backend — module relationships

Cross-module import graph for `backend/`. Each box is a module, each arrow is "X imports from Y". Generated from `agents/codebase-map/backend.json` (no LLM calls). See `agents/graphify/build-mermaid.py`.

**12 modules · 44 cross-module edges**
**Hubs (>= 5 inbound):** `evaluations`, `sessions`, `snapshots`

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

  artifacts --> snapshots
  build_sessions --> evaluations
  dashboard --> phase_tagger
  evaluations --> artifacts
  evaluations --> build_sessions
  evaluations --> hints
  evaluations --> llm
  evaluations --> mentor
  evaluations --> phase_tagger
  evaluations --> sessions
  evaluations --> signal_mentor
  evaluations --> snapshots
  hints --> llm
  hints --> sessions
  hints --> snapshots
  mentor --> evaluations
  mentor --> llm
  mentor --> phase_tagger
  mentor --> sessions
  mentor --> snapshots
  phase_tagger --> artifacts
  questions --> evaluations
  questions --> sessions
  questions --> snapshots
  sessions --> evaluations
  signal_mentor --> evaluations
  signal_mentor --> llm
  signal_mentor --> phase_tagger
  signal_mentor --> sessions
  signal_mentor --> snapshots

  classDef hub fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;
  classDef leaf fill:#dcfce7,stroke:#16a34a;
  classDef entry fill:#e0e7ff,stroke:#6366f1,stroke-dasharray:4 2;
  class evaluations,sessions,snapshots hub;
```

## Dependencies (text form)

| Module | Depends on | Depended on by |
|---|---|---|
| **`artifacts`** | `database`, `snapshots` | `_root`, `evaluations`, `phase-tagger` |
| **`build-sessions`** | `database`, `evaluations`, `common` | `_root`, `evaluations` |
| **`dashboard`** | `database`, `phase-tagger` | `_root` |
| **`evaluations`** | `phase-tagger`, `llm`, `build-sessions`, `sessions`, `artifacts`, `hints`, `mentor`, `signal-mentor`, `snapshots`, `common`, `database` | `_root`, `build-sessions`, `eval-harness`, `mentor`, `questions`, `sessions`, `signal-mentor` |
| **`hints`** | `llm`, `sessions`, `snapshots`, `database` | `_root`, `evaluations` |
| **`llm`** | _none_ | `_root`, `eval-harness`, `evaluations`, `hints`, `mentor`, `signal-mentor` |
| **`mentor`** | `evaluations`, `llm`, `phase-tagger`, `sessions`, `snapshots`, `database` | `_root`, `eval-harness`, `evaluations` |
| **`phase-tagger`** | `artifacts` | `_root`, `dashboard`, `eval-harness`, `evaluations`, `mentor`, `signal-mentor` |
| **`questions`** | `sessions`, `evaluations`, `snapshots`, `common`, `database` | `_root` |
| **`sessions`** | `evaluations`, `common`, `database` | `_root`, `evaluations`, `hints`, `mentor`, `questions`, `signal-mentor` |
| **`signal-mentor`** | `evaluations`, `llm`, `phase-tagger`, `sessions`, `snapshots`, `database` | `_root`, `eval-harness`, `evaluations` |
| **`snapshots`** | `database` | `_root`, `artifacts`, `evaluations`, `hints`, `mentor`, `questions`, `signal-mentor` |
