-- Per-call wall-clock latency for the LLM request that produced this
-- audit. Nullable so existing rows (pre-migration) read as NULL and the
-- audit modal renders "—" for them. Going forward, plan.agent.ts wraps
-- llm.call() with Date.now() and persists the delta.

ALTER TABLE "evaluation_audits" ADD COLUMN "latency_ms" INTEGER;
