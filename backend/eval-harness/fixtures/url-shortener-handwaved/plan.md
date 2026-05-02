# URL Shortener — plan

## Scope

In:
- POST /shorten — create a short URL from a long one
- GET /:code — redirect to the long URL
- Per-user rate limit on creates
- Total click count per short URL

Out: custom slugs, expiring URLs, per-user dashboards, multi-region replication, link-level analytics dashboards.

## NFRs (10K req/s, 200M URLs)

The system needs to handle high read throughput and modest write throughput.
Latency should be low for the redirect path. Storage will grow over time, and
the system needs to scale.

## Architectural shape

A stateless HTTP service in front of Postgres, fronted by a Redis cache for
the hot read path. Components are layered (handlers → services → repos) with
seams at the storage boundary so the DB can be swapped without rewriting
handlers, and at the cache boundary so Redis can be replaced with an
in-process LRU later.

## Data model

`Url(id, slug, target, click_count)`. Single table, primary key on `slug` for
fast lookup. Click counts increment in place.

## Failure modes

Handled: invalid slug returns 404. DB unreachable returns 500.
Punted: partial DB writes, network partitions, slug collision storms.

## Build sequence

1. Skeleton handlers + a slug generator.
2. Repo layer over Postgres.
3. Add Redis cache between handlers and repo.
4. Smoke tests against /shorten and /:code.
