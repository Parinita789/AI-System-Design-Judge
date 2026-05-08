import { Mode } from '../types/rubric.types';

export const MODE_B_PATTERNS: readonly RegExp[] = [
  /\b\d+\s*[kmb]\b(?:\s+\w+){0,3}\s+(req|request|requests|qps|rps|tps|user|users|dau|mau|event|events|message|messages|connection|connections|eps|operations|ops)\b/i,
  /\b\d+\s*(million|billion)\b/i,
  /\b(distributed system|multi[- ]region|globally distributed|horizontal(ly)? scal|shard(ing|ed)?|geo[- ]?replicat)/i,
];

export function classifyMode(prompt: string): Mode {
  return MODE_B_PATTERNS.some((re) => re.test(prompt)) ? 'design' : 'build';
}

export function isModeBQuestion(prompt: string): boolean {
  return classifyMode(prompt) === 'design';
}
