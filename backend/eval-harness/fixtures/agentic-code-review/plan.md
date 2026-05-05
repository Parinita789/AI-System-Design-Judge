# Multi-agent code-review system — design plan

## Scope
In: a webhook-driven service that receives a GitHub PR event, fans the diff
through 5 specialist LLM agents (security, style, logic, test coverage, summary),
aggregates their outputs, and posts one consolidated review comment per PR.

Out of scope: the agents' prompt engineering, web UI, billing, audit/SOX trail,
multi-repo orchestration above 10K PRs/day.

## NFRs
- **Demo scale**: 50 PRs/day on a single API server (one developer running it for a
  month).
- **Target scale**: 10K PRs/day, ~7 PR/min average, p95 burst ~60 PR/min.
- **Latency**: p95 sub-30s per PR end-to-end. (We just need *one* number under 30s.)
- **Inference budget**: $50K/month total. Each PR costs ~$0.15 inferred from
  4-6K tokens through Sonnet-tier ($3/M in, $15/M out) plus an Opus pass on the
  summary ($25/M out, ~500 tokens). At 10K PRs/day × 30 days = 300K PRs/month;
  $50K / 300K ≈ $0.167/PR — fits with ~10% headroom. If usage spikes we route
  the security and logic agents to Haiku ($1/M in, $5/M out) for a 3× cost cut
  and accept the quality drop on those two.

## Architectural shape and seams
Layered service:
- Edge: GitHub webhook receiver → enqueues `ReviewJob` to a Redis queue.
- Workers: pull jobs, invoke `AgentRunner` per agent type.
- `AgentRunner` calls `LlmClient` (the abstraction; Anthropic by default,
  OpenAI as a fallback target with the same interface).
- Aggregator: collects per-agent verdicts, calls a synthesis agent (Opus tier)
  for the final summary.
- Poster: posts the final review back to GitHub PR comments.

Seams:
- **`LlmClient` interface** — swap providers without touching agents.
- **Per-agent prompt template** — each lives in `prompts/<agent>.md`, versioned
  in git. Adding a 6th agent is one file + one queue topic.
- **Cache layer** between AgentRunner and LlmClient — keyed by `(prompt-hash,
  model)`. Re-running the same agent on the same prompt within 24h returns
  the cached completion at zero cost.

## Validation
Every agent's output is validated against a per-agent JSON schema:
- Security agent returns `{ findings: [{ severity, file, line, summary }] }`.
- Style agent returns `{ violations: [{ rule, file, line }] }`.
- etc.

If schema validation fails, we re-prompt the model once with the original prompt
plus the parser error. If the second attempt also fails, the agent's output is
dropped from the consolidated review and a flag is set on the `ReviewJob` for
manual triage. We never silently coerce malformed JSON into a "best-effort"
response.

The synthesis agent is given only schema-validated upstream outputs.

## Observability
Every LLM call is persisted to a `LlmCall` row with:
- `parent_review_job_id`, `agent_type`, `prompt`, `completion`, `model`,
  `tokens_in`, `tokens_out`, `latency_ms`, `cache_hit`, `validation_passed`.

This lets us answer "why did agent X fire on PR Y?" without re-running the
pipeline. Standard APM (request rate, error rate, queue depth) sits on top of
the worker pool.

## State
Agents are stateless per call — each invocation receives the diff and any
upstream agent output as inputs. There's no per-user conversation memory; the
system is one-shot per PR. (Multi-turn agent state is out of scope for v1
because no agent currently needs follow-up.)

## Failover
`LlmClient` checks the response from Anthropic for `429` or `5xx`; on either,
it retries once with exponential backoff (1s, 4s), and on second failure routes
to OpenAI's equivalent model via the same interface. If both providers fail,
the agent's output is dropped (same triage path as schema-validation failure).

## Build sequence
1. `LlmClient` + provider impls + cache.
2. One agent end-to-end (security), schema-validated.
3. Aggregator + synthesis.
4. Webhook receiver + queue.
5. Add the other four agents.
