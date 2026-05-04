import { Mode } from '../types/rubric.types';

export const MODE_B_PATTERNS: readonly RegExp[] = [
  // Numeric throughput in K/M/B with up to 3 intervening adjectives.
  // Catches "10K req/s", "100M daily requests", "50M concurrent users",
  // "100M monthly active users", "1B DAU".
  /\b\d+\s*[kmb]\b(?:\s+\w+){0,3}\s+(req|request|requests|qps|rps|tps|user|users|dau|mau|event|events|message|messages|connection|connections|eps|operations|ops)\b/i,
  // Spelled-out millions/billions: "100 million users", "1 billion requests"
  /\b\d+\s*(million|billion)\b/i,
  // Distributed-system-only language that implies scale beyond 1h
  /\b(distributed system|multi[- ]region|globally distributed|horizontal(ly)? scal|shard(ing|ed)?|geo[- ]?replicat)/i,
];

export function classifyMode(prompt: string): Mode {
  return MODE_B_PATTERNS.some((re) => re.test(prompt)) ? 'design' : 'build';
}

export function isModeBQuestion(prompt: string): boolean {
  return classifyMode(prompt) === 'design';
}
