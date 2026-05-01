# URL Shortener — plan

## Scope

In: paste long URL, get a 7-char short URL; resolve short → long with one redirect; basic per-IP rate limit on creation; analytics = total click count per short URL.
Out: custom slugs, expiring URLs, per-user dashboards, per-link auth, A/B variants, geo-targeting, browser-extension UX. Punt these to v2.

## NFRs (10K req/s, 200M URLs)

- 10K req/s peak is read-heavy: ~9.5K resolves + ~500 creates. Resolve p99 ≤ 50 ms; create p99 ≤ 200 ms.
- 200M URLs over 5 years → ~110K new short URLs per day at the 500-create RPS estimate. Storage: 200M × ~300 B avg = ~60 GB cold; small index.
- Read:write ≈ 20:1, so caching the short→long lookup is high-leverage.

## Shape and seams

Shape: stateless HTTP service in front of Postgres + Redis read-through cache.
Seams that matter at this scale:
1. **Code-generation seam.** Today: random-base62 + uniqueness retry. Tomorrow at higher write RPS: pre-allocated counter ranges per node (Snowflake-ish). The interface is `nextCode(): string`, so swapping is local.
2. **Cache seam.** `Cache.get(code)` → `(longUrl | null)`. Today Redis read-through; can swap for an embedded LRU on each node if Redis becomes the SPOF.
3. **Analytics seam.** Counter increments are async-fire-and-forget into a queue, not in the hot path. Today: SQS → Lambda → Postgres. Tomorrow: Kafka → Flink for windowed aggregates.

## Data model

`urls(short_code PK char(7), long_url text not null, created_at timestamptz default now(), creator_ip inet, click_count bigint default 0)` — single table, no joins on hot path. `short_code` is the primary key so the index is the table; one PK lookup serves a redirect.

Counter writes don't go to this row directly — they go through the analytics queue and a separate aggregation job updates `click_count` periodically. This keeps the hot read path read-only and avoids hot-row contention on popular links.

## Components and interfaces

- `POST /shorten {long_url}` → `{short_code, short_url}`. 200/400. Validates length, scheme; idempotency via SHA1(long_url) lookup before insert.
- `GET /:code` → 301 redirect to `long_url`. 404 on miss.
- `CodeGenerator.nextCode(): string` — see seam #1.
- `Cache` — see seam #2.
- `AnalyticsQueue.recordClick(code)` — fire-and-forget; never blocks the redirect.

## Failure modes

- **Cache miss storm** on a popular code right after eviction → request coalescing in the cache layer (singleflight by code).
- **Hot-row analytics contention** → already mitigated by the queue design, but call out the queue's max-in-flight as the actual ceiling.
- **Code collision under retry storm** → the `nextCode` interface owns this; PK-uniqueness violation triggers regeneration up to N times then 503.
- **Postgres failover** → reads degrade to cache-only for the failover window; new creates 503 until primary returns.

## Build sequence

1. Skeleton service + `POST /shorten` + `GET /:code` against Postgres only (no cache, no queue). Verify with curl + a load test at 100 RPS.
2. Add Redis read-through cache; verify p99 drops on warm cache.
3. Add analytics queue; verify clicks aggregate eventually-consistently and the redirect path stays under 50 ms p99.
4. Failure injection: kill Redis, kill the queue consumer — confirm graceful degradation (no 5xx storms).

## Validation plan

- **Load test** at 10K req/s mixed read/write for 30 min; assert p99 budgets above.
- **Chaos**: random Redis kill mid-run, primary-Postgres failover during the test — expect read availability ≥ 99% during the failover window.
- **Correctness**: idempotency check (same long URL twice → same short code), redirect status code (301), 404 on unknown code, click-count eventual consistency window ≤ 60s.
