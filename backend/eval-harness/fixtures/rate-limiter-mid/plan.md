# Rate limiter — plan

## Scope

In scope: per-tenant + per-route token-bucket rate limiting; configurable bucket size and refill rate; standard 429 + Retry-After header on rejection; admin override to flush a tenant's bucket.

Out of scope: leaky-bucket variants, IP-based limiting (already handled at the WAF), per-user-within-tenant limits, dynamic bucket resizing based on tenant tier (v2).

## Shape

A small middleware library that wraps the request handler. It calls into a Bucket-Store with `tryConsume(tenantId, route, n)` and either passes the request through or returns 429.

The Bucket-Store has two seams:
1. **Backend storage** — interface lets us swap Redis (default) for an in-process LRU map (single-node mode, useful for tests and low-traffic deployments).
2. **Clock source** — injected so tests don't depend on wall-clock time.

## Components

- `Limiter.checkAndConsume(tenantId, route)` — public middleware entry.
- `BucketStore` — interface { tryConsume(key, capacity, refillRate, n): RemainingTokens | RejectedReason }.
- `RedisBucketStore` — Lua script for atomic check-and-consume so two pods can't double-spend a token.
- `MemoryBucketStore` — for tests and the single-node mode.

## Configuration

- Per-tenant config in a small Postgres table loaded at boot + reloaded every 60s. Cache locally — the lookup is too hot to hit Postgres on every request.

## Failure modes

- Redis down → fail-open (let traffic through) since failing closed locks every tenant out and would be worse than over-allowing for a few seconds. This is policy; document loudly.
- Lua script bug → unit-test the script directly with a real Redis in CI.

## Build sequence

1. `MemoryBucketStore` + middleware, exercised via a tiny Express app.
2. `RedisBucketStore` + the Lua atomic-consume script.
3. Config-loader table + 60s refresh.
4. Wire into the production gateway.
