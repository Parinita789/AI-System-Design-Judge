export const CANONICAL_TOPICS = [
  'cache_aside',
  'write_through_cache',
  'write_behind_cache',
  'cdn_edge_logic',
  'read_write_path_separation',
  'denormalization_for_reads',

  'sharding',
  'consistent_hashing',
  'partition_strategies',
  'hot_key_handling',

  'leader_follower_replication',
  'multi_leader_replication',
  'eventual_consistency',
  'strong_consistency',
  'cap_tradeoffs',

  'row_level_locking',
  'optimistic_concurrency',
  'pessimistic_concurrency',
  'transaction_isolation',
  'write_ahead_logs',

  'idempotency',
  'unique_constraint_enforcement',
  'hash_based_id_generation',
  'counter_based_id_generation',

  'capacity_estimation',
  'bottleneck_identification',
  'rate_limiting',
  'backpressure',
  'circuit_breakers',

  'queue_semantics_at_least_once',
  'queue_semantics_at_most_once',
  'queue_semantics_exactly_once',
  'fanout_patterns',
  'event_sourcing',

  'ttl_and_eviction',
  'bloom_filters',
  'indexing_strategies',
  'cold_warm_hot_storage',

  'geo_distribution',
  'failover_strategies',
  'graceful_degradation',

  'presence_heartbeat',
  'websocket_fanout',
  'long_polling',
] as const;

export type CanonicalTopic = (typeof CANONICAL_TOPICS)[number];

const TOPIC_SET: ReadonlySet<string> = new Set(CANONICAL_TOPICS);

export function isCanonicalTopic(name: string): name is CanonicalTopic {
  return TOPIC_SET.has(name);
}
