# Plan-phase eval harness

A standalone runner that exercises the real `PlanAgent.evaluate()` against a
fixed set of `plan.md` fixtures with expected score ranges and per-signal
expectations. Use it to:

- catch regressions when editing `plan-prompt.ts` or `rubrics/v*/plan.yaml`
- compare LLM providers (Anthropic / Ollama / Claude CLI) against the same fixtures
- collect calibration evidence when adjusting weights or anchors

This is **not** a unit test. It hits a real LLM. Provider selection follows
`backend/.env` (`LLM_PROVIDER`, `OLLAMA_BASE_URL`, etc.) — same dispatch as
production code via `LlmProviderFactory`.

## Run it

From `backend/`:

```bash
# All fixtures, with whatever provider .env configures
npm run eval:plan

# A subset
npm run eval:plan -- --filter=url-shortener

# Write JSON report (in addition to console output)
npm run eval:plan -- --out=./eval-out.json

# Override provider for a single run
LLM_PROVIDER=claude_cli   npm run eval:plan
OLLAMA_BASE_URL=http://localhost:11434 OLLAMA_MODEL=llama3.1 npm run eval:plan
```

Exit code: `0` if every (non-`warnOnly`) fixture passed, `1` otherwise.

## Output shape

Console table per fixture, then a summary line. Failed fixtures print their
mismatch reasons inline:

```
Fixture                              | Score  | Expected    | Signals  | Time    | Verdict
url-shortener-thorough               | 4.25   | 3.5–5.0     | 5/5      | 6.2s    | PASS
url-shortener-empty                  | 1.00   | 0.0–2.0     | 3/3      | 5.8s    | PASS
rate-limiter-mid                     | 2.80   | 2.5–3.5     | 3/4      | 6.1s    | FAIL
   ✗ validation_plan_concrete expected miss, got partial ("…")
…
4/5 fixtures passed in 30.4s on provider=claude_cli model=claude-cli rubric=v1.0
```

The `--out` JSON contains everything in the console plus the full per-signal
evidence quotes — useful for diffing across runs.

## Fixture format

Each fixture lives at `fixtures/<name>/` and contains exactly two files:

```
fixtures/<name>/
  plan.md         # the plan being judged (the input artifact)
  fixture.yaml    # metadata + expectations
```

`fixture.yaml` schema:

```yaml
description: "One-line summary that lands in the console output."
question: "Design a URL shortener for 10K req/s and 200M URLs."
rubricVersion: v1.0

# LLM judgments are noisy. Score is a tolerated range, not an exact value.
expectedScore:
  min: 3.5
  max: 5.0

# Per-signal expectations. Modes:
#   hit         judge must return HIT
#   partial     judge must return PARTIAL
#   miss        judge must return MISS
#   credited    HIT or PARTIAL accepted (lenient "earned credit")
#   skipped     cannot_evaluate (use for relevance-gated signals)
expectedSignals:
  credited: [scope_specificity, dual_scale_nfrs]
  miss: []
  hit: []
  skipped: [ai_strategy_explicit]      # e.g., non-AI question

# Optional: emit the mismatches but don't fail the suite. Useful while
# calibrating a new fixture. Default false.
warnOnly: false

# Optional: synthetic hint chat history if the fixture wants to test the
# AI-authored-plan signal. Each entry shows up in the user payload.
hints:
  - occurredAt: "2026-04-30T12:00:00Z"
    elapsedMinutes: 5
    prompt: "What's the read/write ratio?"
    response: "What does your scope say about peak RPS?"
```

Signal IDs in `expectedSignals.*` are **validated against the rubric at
startup** — a typo throws before any LLM call, instead of silently passing
because "the signal was never returned, so we never noticed."

## Adding a new fixture

1. Create `fixtures/<name>/` with `plan.md` (the artifact) and an empty
   `fixture.yaml` containing only `description`, `question`, `rubricVersion`,
   and a placeholder `expectedScore: { min: 0, max: 5 }`.
2. Run `npm run eval:plan -- --filter=<name>` — it will pass trivially
   because the score range is wide and there are no signal expectations.
   Read the actual score and per-signal output.
3. Tighten `expectedScore` to a range around the observed score (give it
   ~±0.5 leeway for LLM noise).
4. Decide which signals you want to lock in; add them to `expectedSignals`.
   Use `credited` over `hit` unless you specifically want a strict full-hit.
5. Re-run; iterate until the fixture passes consistently across 2–3 runs.
6. Commit.

## Seed fixtures

Five seeded with the harness, spanning verdict tiers and the relevance gate:

| Fixture | Question | Expected verdict |
| --- | --- | --- |
| `url-shortener-thorough` | URL shortener at 10K req/s | Good (3.5–5.0) |
| `url-shortener-empty` | URL shortener at 10K req/s | Failed (0.0–2.0) |
| `rate-limiter-mid` | Token-bucket rate limiter | Average (2.5–3.5) |
| `chat-app-with-ai-coach` | Chat app with Socratic AI coach | Good (3.0–4.5), AI signals **not** skipped |
| `log-pipeline-no-ai` | 50K eps log ingestion pipeline | Average–Good (2.5–4.0), AI signals skipped |

The AI-related fixtures are paired intentionally: one where AI signals
should fire, one where they should be skipped. Together they exercise the
relevance-gating rule in `plan-prompt.ts`.

## Out of scope (for now)

- `--calibrate` flag that writes a draft `fixture.yaml` from the LLM output.
- CI integration / drift dashboards / scheduled runs.
- Multi-provider comparison report (run twice, diff the JSON manually).
- Statistical analysis (running each fixture N times to compute variance).
- Harnesses for `build`, `validate`, `wrap` — those agents are still stubs.
