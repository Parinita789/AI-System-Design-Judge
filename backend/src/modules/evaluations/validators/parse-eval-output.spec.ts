import { EvaluationParseError, parseEvalOutput } from './parse-eval-output';

const MINIMAL = {
  signals: {
    a: { result: 'hit', evidence: 'quote a' },
    b: { result: 'miss', evidence: '' },
  },
  feedback: 'ok',
  top_actions: ['x'],
};

describe('parseEvalOutput', () => {
  it('parses a minimal valid response', () => {
    const out = parseEvalOutput(JSON.stringify(MINIMAL));
    expect(out.signals).toEqual({
      a: { result: 'hit', evidence: 'quote a' },
      b: { result: 'miss', evidence: '' },
    });
    expect(out.feedback).toBe('ok');
    expect(out.topActions).toEqual(['x']);
    expect(out.droppedSignalIds).toEqual([]);
  });

  it('strips ```json fences before parsing', () => {
    const wrapped = '```json\n' + JSON.stringify(MINIMAL) + '\n```';
    const out = parseEvalOutput(wrapped);
    expect(out.signals.a.result).toBe('hit');
  });

  it('extracts a balanced JSON object out of surrounding prose', () => {
    const noisy = `Here's the JSON: ${JSON.stringify(MINIMAL)} hope that helps`;
    const out = parseEvalOutput(noisy);
    expect(out.signals.a.result).toBe('hit');
  });

  describe('expectedSignalIds filtering', () => {
    it('drops unknown signal ids when expectedSignalIds is provided', () => {
      const raw = {
        signals: {
          known_signal: { result: 'hit', evidence: 'q' },
          hallucinated: { result: 'partial', evidence: 'q' },
          another_unknown: { result: 'miss', evidence: 'q' },
        },
        feedback: 'ok',
        top_actions: [],
      };
      const out = parseEvalOutput(
        JSON.stringify(raw),
        new Set(['known_signal']),
      );
      expect(Object.keys(out.signals)).toEqual(['known_signal']);
      expect(out.droppedSignalIds).toEqual(['hallucinated', 'another_unknown']);
    });

    it('returns empty droppedSignalIds when every id is known', () => {
      const out = parseEvalOutput(
        JSON.stringify(MINIMAL),
        new Set(['a', 'b']),
      );
      expect(out.droppedSignalIds).toEqual([]);
      expect(Object.keys(out.signals).sort()).toEqual(['a', 'b']);
    });

    it('does not validate dropped signals\' inner shape', () => {
      // A hallucinated signal with a malformed body would normally throw
      // (missing/invalid result/evidence). When it's outside the expected
      // set, it should be silently dropped instead.
      const raw = {
        signals: {
          known: { result: 'hit', evidence: 'q' },
          junk: { not_a_real_field: 42 },
        },
        feedback: 'ok',
        top_actions: [],
      };
      const out = parseEvalOutput(
        JSON.stringify(raw),
        new Set(['known']),
      );
      expect(out.droppedSignalIds).toEqual(['junk']);
      expect(out.signals).toEqual({
        known: { result: 'hit', evidence: 'q' },
      });
    });

    it('still validates inner shape for in-set signals', () => {
      const raw = {
        signals: {
          known: { result: 'invalid_verdict', evidence: 'q' },
        },
        feedback: 'ok',
        top_actions: [],
      };
      expect(() =>
        parseEvalOutput(JSON.stringify(raw), new Set(['known'])),
      ).toThrow(EvaluationParseError);
    });

    it('accepts every signal when expectedSignalIds is omitted (back-compat)', () => {
      const raw = {
        signals: {
          a: { result: 'hit', evidence: 'q' },
          unrecognized_id: { result: 'miss', evidence: 'q' },
        },
        feedback: 'ok',
        top_actions: [],
      };
      const out = parseEvalOutput(JSON.stringify(raw));
      expect(Object.keys(out.signals).sort()).toEqual([
        'a',
        'unrecognized_id',
      ]);
      expect(out.droppedSignalIds).toEqual([]);
    });
  });

  describe('errors', () => {
    it('throws on completely non-JSON output', () => {
      expect(() => parseEvalOutput('I cannot evaluate this plan.')).toThrow(
        EvaluationParseError,
      );
    });

    it('throws when feedback is missing', () => {
      const raw = { signals: {}, top_actions: [] };
      expect(() => parseEvalOutput(JSON.stringify(raw))).toThrow(
        EvaluationParseError,
      );
    });

    it('throws when top_actions is not an array', () => {
      const raw = {
        signals: {},
        feedback: 'ok',
        top_actions: 'not an array',
      };
      expect(() => parseEvalOutput(JSON.stringify(raw))).toThrow(
        EvaluationParseError,
      );
    });

    it('accepts camelCase topActions as an alias', () => {
      const raw = {
        signals: { a: { result: 'hit', evidence: 'q' } },
        feedback: 'ok',
        topActions: ['act'],
      };
      const out = parseEvalOutput(JSON.stringify(raw));
      expect(out.topActions).toEqual(['act']);
    });
  });
});
