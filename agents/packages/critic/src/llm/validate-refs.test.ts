import {
  validateFileIssues,
  validateModuleIssues,
  validateSynthesis,
  formatFaultsForRetry,
  RUBRIC_AXES,
} from './validate-refs';
import { FileIssue, ModuleIssue, Synthesis } from '../types';

describe('validateFileIssues', () => {
  const source = { repoPath: 'foo/bar.ts', lineCount: 100 };

  it('passes a clean issue', () => {
    const issue: FileIssue = {
      severity: 'high',
      axis: 'error-handling',
      fingerprint: 'catch-all swallows error context',
      lines: [12, 13],
      issue: 'The catch block discards the error and continues.',
    };
    expect(validateFileIssues('foo/bar.ts', source, [issue])).toEqual([]);
  });

  it('flags out-of-range line numbers', () => {
    const issue: FileIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'off-by-one in range slice',
      lines: [9999],
      issue: 'x',
    };
    const faults = validateFileIssues('foo/bar.ts', source, [issue]);
    expect(faults).toHaveLength(1);
    expect(faults[0].kind).toBe('line-out-of-range');
  });

  it('flags unknown axis', () => {
    const issue = {
      severity: 'high',
      axis: 'totally-made-up',
      fingerprint: 'x',
      lines: [5],
      issue: 'x',
    } as unknown as FileIssue;
    const faults = validateFileIssues('foo/bar.ts', source, [issue]);
    expect(faults).toHaveLength(1);
    expect(faults[0].kind).toBe('unknown-axis');
  });

  it('flags unknown severity', () => {
    const issue = {
      severity: 'catastrophic',
      axis: 'correctness',
      fingerprint: 'x',
      lines: [5],
      issue: 'x',
    } as unknown as FileIssue;
    expect(validateFileIssues('foo/bar.ts', source, [issue])[0].kind).toBe(
      'unknown-severity',
    );
  });
});

describe('validateModuleIssues', () => {
  const fileMap = new Map([
    ['foo/a.ts', { repoPath: 'foo/a.ts', lineCount: 50 }],
    ['foo/b.ts', { repoPath: 'foo/b.ts', lineCount: 80 }],
  ]);

  it('flags references to files not in the module set', () => {
    const issue: ModuleIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'x',
      file: 'foo/c.ts',
      lines: [10],
      issue: 'x',
    };
    expect(validateModuleIssues(fileMap, [issue])[0].kind).toBe('unknown-file');
  });

  it('flags out-of-range lines in known files', () => {
    const issue: ModuleIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'x',
      file: 'foo/a.ts',
      lines: [999],
      issue: 'x',
    };
    expect(validateModuleIssues(fileMap, [issue])[0].kind).toBe('line-out-of-range');
  });

  it('accepts a leading "./" path prefix', () => {
    const issue: ModuleIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'x',
      file: './foo/a.ts',
      lines: [10],
      issue: 'x',
    };
    expect(validateModuleIssues(fileMap, [issue])).toEqual([]);
  });

  it('accepts a basename when it uniquely matches', () => {
    const issue: ModuleIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'x',
      file: 'a.ts',
      lines: [10],
      issue: 'x',
    };
    expect(validateModuleIssues(fileMap, [issue])).toEqual([]);
  });

  it('rejects an ambiguous basename', () => {
    const ambiguous = new Map([
      ['mod1/util.ts', { repoPath: 'mod1/util.ts', lineCount: 50 }],
      ['mod2/util.ts', { repoPath: 'mod2/util.ts', lineCount: 50 }],
    ]);
    const issue: ModuleIssue = {
      severity: 'high',
      axis: 'correctness',
      fingerprint: 'x',
      file: 'util.ts',
      lines: [10],
      issue: 'x',
    };
    expect(validateModuleIssues(ambiguous, [issue])[0].kind).toBe('unknown-file');
  });
});

describe('validateSynthesis', () => {
  const known = new Set(['evaluations', 'sessions', 'hints']);

  it('flags patterns that only affect one module', () => {
    const synth: Synthesis = {
      grade: 'B',
      narrative: 'x',
      topRisks: [],
      topStrengths: [],
      crossCuttingPatterns: [
        {
          severity: 'high',
          title: 'x',
          detail: 'x',
          affectedModules: ['evaluations'],
        },
      ],
      highPriorityItems: [],
    };
    expect(validateSynthesis(known, synth)[0].kind).toBe('pattern-too-narrow');
  });

  it('flags unknown module references', () => {
    const synth: Synthesis = {
      grade: 'B',
      narrative: 'x',
      topRisks: [],
      topStrengths: [],
      crossCuttingPatterns: [],
      highPriorityItems: [
        { severity: 'critical', module: 'ghost-module', issue: 'x' },
      ],
    };
    expect(validateSynthesis(known, synth)[0].kind).toBe('unknown-module');
  });
});

describe('formatFaultsForRetry', () => {
  it('returns empty string when no faults', () => {
    expect(formatFaultsForRetry([])).toBe('');
  });

  it('formats each fault on its own line', () => {
    const out = formatFaultsForRetry([
      { kind: 'unknown-axis', detail: 'foo' },
      { kind: 'line-out-of-range', detail: 'bar' },
    ]);
    expect(out).toContain('[unknown-axis] foo');
    expect(out).toContain('[line-out-of-range] bar');
  });
});

describe('RUBRIC_AXES', () => {
  it('matches the rubric.md axis list', () => {
    expect(RUBRIC_AXES).toEqual([
      'correctness',
      'error-handling',
      'boundary-safety',
      'observability',
      'testability',
      'api-shape',
      'naming-readability',
    ]);
  });
});
