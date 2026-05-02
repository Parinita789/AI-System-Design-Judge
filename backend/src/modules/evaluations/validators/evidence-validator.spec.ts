import { validateEvidence } from './evidence-validator';
import { SignalResult } from '../types/evaluation.types';

const result = (r: SignalResult['result'], evidence = ''): SignalResult => ({
  result: r,
  evidence,
});

describe('validateEvidence', () => {
  const PLAN = `
# URL Shortener

## Scope

In: paste long URL, get a 7-char short URL; resolve short → long with one redirect.

## Data model

Url(id, slug, target, click_count). Single table.

## Build sequence

1. Skeleton service + POST /shorten + GET /:code against Postgres only.
2. Add Redis read-through cache.
3. Add analytics queue.
`;

  describe('grounded evidence (does not downgrade)', () => {
    it('passes a verbatim quote from plan.md', () => {
      const out = validateEvidence(
        {
          data_model_committed: result(
            'hit',
            'Url(id, slug, target, click_count). Single table.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
      expect(out.signals.data_model_committed.result).toBe('hit');
    });

    it('passes a paraphrase that shares a 5-word phrase', () => {
      const out = validateEvidence(
        {
          build_sequence_planned: result(
            'hit',
            'The plan articulates a Skeleton service + POST /shorten + GET sequence.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
    });

    it('passes when evidence is grounded in hint history rather than plan.md', () => {
      const out = validateEvidence(
        {
          ai_strategy_explicit: result(
            'hit',
            'Candidate said: I will use AI for boilerplate scaffolding only.',
          ),
        },
        PLAN,
        [
          {
            prompt: 'How should I split AI vs my own work?',
            response: 'I will use AI for boilerplate scaffolding only.',
          },
        ],
      );
      expect(out.downgraded).toEqual([]);
    });
  });

  describe('ungrounded evidence (downgrades)', () => {
    it('downgrades HIT→PARTIAL when the evidence quotes nothing in the corpus', () => {
      const out = validateEvidence(
        {
          capacity_estimation: result(
            'hit',
            // Plan has no capacity numbers anywhere — invented evidence.
            'The plan estimates 200M URLs at 300 bytes each = 60 GB hot storage.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual(['capacity_estimation']);
      expect(out.signals.capacity_estimation.result).toBe('partial');
      expect(out.signals.capacity_estimation.evidence).toContain('[unverifiable');
      expect(out.signals.capacity_estimation.evidence).toContain('hit → partial');
    });

    it('downgrades PARTIAL→MISS when ungrounded', () => {
      const out = validateEvidence(
        {
          consistency_model_chosen: result(
            'partial',
            'The plan vaguely mentions an eventual consistency tradeoff for click counts.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual(['consistency_model_chosen']);
      expect(out.signals.consistency_model_chosen.result).toBe('miss');
      expect(out.signals.consistency_model_chosen.evidence).toContain('partial → miss');
    });

    it('reports each downgraded signal id', () => {
      const out = validateEvidence(
        {
          a: result('hit', 'Plan says it uses Cassandra clusters with Raft consensus.'),
          b: result('hit', 'Plan describes a 5-region active-active topology.'),
          c: result('hit', 'Url(id, slug, target, click_count). Single table.'),
        },
        PLAN,
        [],
      );
      expect(out.downgraded.sort()).toEqual(['a', 'b']);
      expect(out.signals.c.result).toBe('hit');
    });
  });

  describe('skip cases (does not validate)', () => {
    it('does not touch MISS signals', () => {
      const out = validateEvidence(
        { x: result('miss', 'Plan does not mention sharding.') },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
      expect(out.signals.x.result).toBe('miss');
    });

    it('does not touch cannot_evaluate signals', () => {
      const out = validateEvidence(
        {
          x: result(
            'cannot_evaluate',
            'AI signals not applicable to a URL shortener question.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
      expect(out.signals.x.result).toBe('cannot_evaluate');
    });

    it('skips evidence shorter than 20 chars (boilerplate)', () => {
      const out = validateEvidence({ x: result('hit', 'see plan.md') }, PLAN, []);
      expect(out.downgraded).toEqual([]);
    });

    it('skips when the evidence has fewer than 5 long words after normalization', () => {
      const out = validateEvidence(
        // Long but mostly punctuation / very short tokens — letting it
        // through is safer than a confident downgrade on weak signal.
        { x: result('hit', 'A B C D E F G H I J K L M N O.') },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
    });
  });

  describe('normalization', () => {
    it('matches across casing and punctuation differences', () => {
      const out = validateEvidence(
        {
          x: result(
            'hit',
            'The plan mentions: "URL(ID, SLUG, TARGET, CLICK_COUNT) — single table".',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
    });

    it('matches across whitespace differences', () => {
      const out = validateEvidence(
        {
          x: result(
            'hit',
            'Skeleton    service\n\n+ POST  /shorten\n+ GET /:code   against\n   Postgres only.',
          ),
        },
        PLAN,
        [],
      );
      expect(out.downgraded).toEqual([]);
    });
  });

  describe('null plan', () => {
    it('downgrades HIT signals when plan.md is null and no hints exist', () => {
      const out = validateEvidence(
        { x: result('hit', 'The plan articulates a clear data model with three entities.') },
        null,
        [],
      );
      expect(out.downgraded).toEqual(['x']);
    });
  });
});
