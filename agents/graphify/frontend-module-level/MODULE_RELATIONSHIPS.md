# frontend — module relationships

Cross-module import graph for `frontend/`. Each box is a module, each arrow is "X imports from Y". Generated from `agents/codebase-map/frontend.json` (no LLM calls). See `agents/graphify/build-mermaid.py`.

**22 modules · 11 cross-module edges**
**Hubs (>= 5 inbound):** `services/api`
**Leaves (no inbound):** `pages/ActiveSession`, `pages/QuestionDetail`, `pages/SessionResults`, `pages/SessionStart`, `services/buildSessions`, `services/dashboard`, `services/evaluations`, `services/hints`, `services/mentor`, `services/questions`, `services/rubrics`, `services/sessions`, `services/signalMentor`, `services/snapshots`, `components`, `hooks`, `lib`, `store`, `types`

```mermaid
flowchart LR
  pages_ActiveSession["pages/ActiveSession"]
  pages_QuestionDetail["pages/QuestionDetail"]
  pages_SessionResults["pages/SessionResults"]
  pages_SessionStart["pages/SessionStart"]
  services_api["services/api"]
  services_buildSessions["services/buildSessions"]
  services_dashboard["services/dashboard"]
  services_evaluations["services/evaluations"]
  services_hints["services/hints"]
  services_mentor["services/mentor"]
  services_questions["services/questions"]
  services_rubrics["services/rubrics"]
  services_sessions["services/sessions"]
  services_signalMentor["services/signalMentor"]
  services_snapshots["services/snapshots"]
  components["components"]
  hooks["hooks"]
  lib["lib"]
  store["store"]
  types["types"]
  routes["routes"]
  _root["_root"]

  services_buildSessions --> services_api
  services_dashboard --> services_api
  services_evaluations --> services_api
  services_hints --> services_api
  services_mentor --> services_api
  services_questions --> services_api
  services_rubrics --> services_api
  services_sessions --> services_api
  services_signalMentor --> services_api
  services_snapshots --> services_api
  _root --> routes

  classDef hub fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;
  classDef leaf fill:#dcfce7,stroke:#16a34a;
  classDef entry fill:#e0e7ff,stroke:#6366f1,stroke-dasharray:4 2;
  class services_api hub;
  class pages_ActiveSession,pages_QuestionDetail,pages_SessionResults,pages_SessionStart,services_buildSessions,services_dashboard,services_evaluations,services_hints,services_mentor,services_questions,services_rubrics,services_sessions,services_signalMentor,services_snapshots,components,hooks,lib,store,types leaf;
  class _root entry;
```

## Dependencies (text form)

| Module | Depends on | Depended on by |
|---|---|---|
| **`_root`** | `routes` | _none_ |
| **`components`** | _none_ | _none_ |
| **`hooks`** | _none_ | _none_ |
| **`lib`** | _none_ | _none_ |
| **`pages/ActiveSession`** | _none_ | _none_ |
| **`pages/QuestionDetail`** | _none_ | _none_ |
| **`pages/SessionResults`** | _none_ | _none_ |
| **`pages/SessionStart`** | _none_ | _none_ |
| **`routes`** | _none_ | `_root` |
| **`services/api`** | _none_ | `services/buildSessions`, `services/dashboard`, `services/evaluations`, `services/hints`, `services/mentor`, `services/questions`, `services/rubrics`, `services/sessions`, `services/signalMentor`, `services/snapshots` |
| **`services/buildSessions`** | `services/api` | _none_ |
| **`services/dashboard`** | `services/api` | _none_ |
| **`services/evaluations`** | `services/api` | _none_ |
| **`services/hints`** | `services/api` | _none_ |
| **`services/mentor`** | `services/api` | _none_ |
| **`services/questions`** | `services/api` | _none_ |
| **`services/rubrics`** | `services/api` | _none_ |
| **`services/sessions`** | `services/api` | _none_ |
| **`services/signalMentor`** | `services/api` | _none_ |
| **`services/snapshots`** | `services/api` | _none_ |
| **`store`** | _none_ | _none_ |
| **`types`** | _none_ | _none_ |
