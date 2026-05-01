# Log ingestion pipeline — plan

## Scope

In: structured (JSON) log events from ~500 microservices, 50K events/sec peak, 30-day hot retention with full-text + structured-field search, schema-on-read for ad-hoc queries, alerting on saved queries.

Out: APM/tracing (separate system), metrics (Prometheus already), audit log compliance (separate retention rules), cold archive beyond 30 days (S3 dump, queryable via Athena, not in this design).

## NFRs

- 50K events/sec sustained peak; 100K bursts for ≤ 5 min. Average event size 1 KB → ~50 MB/sec ingest.
- 30-day hot retention at 50K eps × 86400s × 30d × 1 KB ≈ 130 TB hot.
- Query p95: simple field filter over 24h ≤ 2s; full-text over 7d ≤ 30s.
- Lossy under upstream pressure: better to drop 0.1% of events than to back up the producers and crash them. Document this.

## Shape and seams

Producers → Kafka (buffer + replay) → ingest workers (parse, enrich, route) → search-index cluster (OpenSearch) → query API + UI.

Seams:
1. **Transport.** Kafka today. Could swap for Kinesis if we move to AWS-native, the contract is "ordered, replayable, partitioned by service-id".
2. **Index store.** OpenSearch today. Could split hot (fast) vs warm (cheaper) tiers behind the same query API later.
3. **Schema enforcement.** Ingest workers tag each event with a source-version; downstream consumers query by tag. No global schema today; we'll add one when we hit query-correctness pain.

## Data model

- One index per day per service-cluster: `logs-<cluster>-<yyyy.mm.dd>`. Lets us drop 30-day-old data with `DELETE INDEX` (cheap) instead of per-document deletes.
- Documents are dynamic-mapped JSON with reserved keys: `@timestamp`, `service`, `env`, `level`, `trace_id`, `message`. Everything else is free-form.
- Trace_id linked to APM via convention only; no FK between systems.

## Failure modes

- **Upstream burst > Kafka capacity** → producers fall back to local-disk buffer with a 5-minute window; dropped events after that. Alert on producer-side drops.
- **OpenSearch cluster yellow/red** → ingest workers slow down (back-pressure to Kafka, not to producers). Query API serves whatever's reachable with a "partial results" header.
- **Query overload** → per-tenant query quotas in the API gateway; runaway queries killed at 60s.

## Build sequence

1. Kafka cluster + a single producer SDK + a no-op consumer; verify end-to-end at 5K eps.
2. Ingest workers writing into a 3-node OpenSearch cluster; verify simple field-filter queries.
3. Daily-index lifecycle (create + drop) + a 7-day full-text query.
4. Burst test at 100K eps for 5 min; verify dropped-event accounting matches the policy.

## Validation plan

- Synthetic load test at 50K eps for 24h; assert p95 query latency budgets above; assert ≤ 0.1% loss.
- Chaos: kill a Kafka broker mid-test; kill an OpenSearch data node; confirm graceful degradation per the failure-modes section.
- Correctness: replay a known fixture trace through the pipeline; assert all events arrive in the expected indices with the expected fields.
