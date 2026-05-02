import { classifyMode, isModeBQuestion } from './mode-classifier';

describe('classifyMode', () => {
  it.each([
    ['Design a URL shortener for 10K req/s and 200M URLs.', 'design'],
    ['Design a chat for 100M users.', 'design'],
    ['Design a log pipeline at 50K events/sec.', 'design'],
    ['Build a feed for 100 million daily actives.', 'design'],
    ['Design a distributed system for global counters.', 'design'],
    ['Design a sharded key-value store.', 'design'],
    ['Design a multi-region replicated cache.', 'design'],
  ])('%s → design', (prompt, expected) => {
    expect(classifyMode(prompt)).toBe(expected);
  });

  it.each([
    ['Design a simple URL shortener.', 'build'],
    ['Build a token-bucket rate limiter for an API.', 'build'],
    ['Design a counter service handling 100 req/s.', 'build'],
    ['Build a single-node task scheduler.', 'build'],
    ['Design a chat application with a Socratic AI coach.', 'build'],
  ])('%s → build (default)', (prompt, expected) => {
    expect(classifyMode(prompt)).toBe(expected);
  });

  it('does not match "ai" inside other words (false-positive guard)', () => {
    // A question about maintaining a leaderboard contains the substring
    // "ai" but should NOT be treated as production-scale on that basis.
    // (This guard lives in the AI relevance gate, not here, but it's
    // worth pinning behavior since the patterns share heritage.)
    expect(classifyMode('Build a system to maintain a leaderboard for video games.')).toBe(
      'build',
    );
  });

  it('isModeBQuestion is the inverse-default of classifyMode', () => {
    expect(isModeBQuestion('Design at 10K req/s')).toBe(true);
    expect(isModeBQuestion('Build a counter')).toBe(false);
  });
});
