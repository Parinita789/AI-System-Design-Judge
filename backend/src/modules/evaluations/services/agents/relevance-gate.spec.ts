import { applyAIRelevanceGate, applyModeBBuildExecutionGate } from './relevance-gate';
import { SignalResult } from '../../models/evaluation.types';

const aiResults = (): Record<string, SignalResult> => ({
  scope_specificity: { result: 'hit', evidence: 'great scope' },
  ai_strategy_explicit: { result: 'miss', evidence: 'no AI strategy mentioned' },
  ai_strategy_absent: { result: 'hit', evidence: 'no AI usage section' },
  ai_authored_plan: { result: 'miss', evidence: 'looks human-written' },
});

describe('applyAIRelevanceGate', () => {
  describe('on a non-AI question', () => {
    const PROMPT = 'Design a URL shortener for 10K req/s and 200M URLs.';

    it('overrides domain-specific AI signals to cannot_evaluate', () => {
      const out = applyAIRelevanceGate(PROMPT, aiResults());
      expect(out.results.ai_strategy_explicit.result).toBe('cannot_evaluate');
      expect(out.results.ai_strategy_absent.result).toBe('cannot_evaluate');
    });

    it('preserves the LLM original judgment in the evidence string', () => {
      const out = applyAIRelevanceGate(PROMPT, aiResults());
      expect(out.results.ai_strategy_absent.evidence).toContain('LLM originally returned "hit"');
      expect(out.results.ai_strategy_absent.evidence).toContain('no AI usage section');
    });

    it('reports which signals it gated', () => {
      const out = applyAIRelevanceGate(PROMPT, aiResults());
      expect(out.gated.sort()).toEqual(['ai_strategy_absent', 'ai_strategy_explicit']);
    });

    it('leaves non-AI signals untouched', () => {
      const out = applyAIRelevanceGate(PROMPT, aiResults());
      expect(out.results.scope_specificity).toEqual({ result: 'hit', evidence: 'great scope' });
    });

    it('does NOT gate ai_authored_plan (applies to any question domain)', () => {
      const out = applyAIRelevanceGate(PROMPT, aiResults());
      expect(out.results.ai_authored_plan).toEqual({ result: 'miss', evidence: 'looks human-written' });
    });

    it('skips signals the LLM already marked cannot_evaluate', () => {
      const input = aiResults();
      input.ai_strategy_explicit = { result: 'cannot_evaluate', evidence: 'n/a' };
      const out = applyAIRelevanceGate(PROMPT, input);
      expect(out.gated).not.toContain('ai_strategy_explicit');
      // Original evidence preserved, not overwritten.
      expect(out.results.ai_strategy_explicit.evidence).toBe('n/a');
    });
  });

  describe('on an AI-related question', () => {
    it('passes all signals through untouched when the prompt mentions AI', () => {
      const out = applyAIRelevanceGate(
        'Design a chat application with a Socratic AI coach for system design.',
        aiResults(),
      );
      expect(out.gated).toEqual([]);
      expect(out.results).toEqual(aiResults());
    });

    it.each([
      ['mentions LLM', 'Design an LLM-backed code-review tool.'],
      ['mentions agent', 'Design an agentic workflow runner.'],
      ['mentions GPT', 'Build a GPT-powered email triage system.'],
      ['mentions RAG', 'Design a RAG pipeline for legal documents.'],
      ['mentions language model', 'Design a chat with a small language model.'],
    ])('treats "%s" as AI-domain', (_label, prompt) => {
      const out = applyAIRelevanceGate(prompt, aiResults());
      expect(out.gated).toEqual([]);
    });
  });

  describe('word-boundary matching', () => {
    it('does not match "ai" inside other words', () => {
      // "maintain" contains "ai" but should NOT trigger AI-domain gating.
      const out = applyAIRelevanceGate(
        'Design a system to maintain a leaderboard for video games.',
        aiResults(),
      );
      expect(out.gated.length).toBeGreaterThan(0);
    });

    it('does not match "ml" inside "html"', () => {
      const out = applyAIRelevanceGate(
        'Design a service that serves static HTML pages globally.',
        aiResults(),
      );
      expect(out.gated.length).toBeGreaterThan(0);
    });
  });
});

describe('applyModeBBuildExecutionGate', () => {
  const buildResults = (): Record<string, SignalResult> => ({
    scope_specificity: { result: 'hit', evidence: 'good scope' },
    no_build_sequence: { result: 'hit', evidence: 'no ordered list of build steps' },
    no_validation_plan: { result: 'partial', evidence: 'mentions tests vaguely' },
    build_sequence_planned: { result: 'miss', evidence: 'no sequence' },
  });

  describe('on a Mode-B (production-scale) question', () => {
    const PROMPT = 'Design a URL shortener for 10K req/s and 200M URLs.';

    it('overrides no_build_sequence to cannot_evaluate when LLM fired it', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.results.no_build_sequence.result).toBe('cannot_evaluate');
    });

    it('overrides no_validation_plan from PARTIAL to cannot_evaluate', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.results.no_validation_plan.result).toBe('cannot_evaluate');
    });

    it('preserves the LLM original judgment in the evidence string', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.results.no_build_sequence.evidence).toContain('LLM originally returned "hit"');
      expect(out.results.no_build_sequence.evidence).toContain('production scale');
    });

    it('reports which signals it gated', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.gated.sort()).toEqual(['no_build_sequence', 'no_validation_plan']);
    });

    it('leaves scope_specificity (and other unrelated signals) untouched', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.results.scope_specificity).toEqual({ result: 'hit', evidence: 'good scope' });
    });

    it('does NOT touch the good counterparts (build_sequence_planned)', () => {
      const out = applyModeBBuildExecutionGate(PROMPT, buildResults());
      expect(out.results.build_sequence_planned).toEqual({
        result: 'miss',
        evidence: 'no sequence',
      });
    });

    it('does NOT override when the LLM already returned MISS (bad signal correctly didn\'t fire)', () => {
      const input = buildResults();
      input.no_build_sequence = { result: 'miss', evidence: 'plan has a sequence' };
      const out = applyModeBBuildExecutionGate(PROMPT, input);
      expect(out.gated).not.toContain('no_build_sequence');
      expect(out.results.no_build_sequence).toEqual({
        result: 'miss',
        evidence: 'plan has a sequence',
      });
    });

    it.each([
      ['10K req/s', 'Design a service handling 10K req/s.'],
      ['100M users', 'Design a chat for 100M users.'],
      ['50K events/sec', 'Design a log pipeline at 50K events/sec.'],
      ['100 million', 'Design a feed for 100 million daily actives.'],
      ['distributed system', 'Design a distributed system for global counters.'],
      ['shard', 'Design a sharded key-value store.'],
      ['multi-region', 'Design a multi-region replicated cache.'],
    ])('classifies "%s" as Mode B', (_label, prompt) => {
      const out = applyModeBBuildExecutionGate(prompt, buildResults());
      expect(out.gated.length).toBeGreaterThan(0);
    });
  });

  describe('on a Mode-A (small / no scale) question', () => {
    it.each([
      ['no scale stated', 'Design a simple URL shortener.'],
      ['low RPS', 'Design a counter service handling 100 req/s.'],
      ['single tenant', 'Design a single-node rate limiter.'],
    ])('passes %s through untouched', (_label, prompt) => {
      const out = applyModeBBuildExecutionGate(prompt, buildResults());
      expect(out.gated).toEqual([]);
      expect(out.results).toEqual(buildResults());
    });
  });
});
