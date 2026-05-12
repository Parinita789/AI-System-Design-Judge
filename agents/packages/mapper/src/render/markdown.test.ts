import { renderPackageMarkdown } from './markdown';
import { PackageMap } from '../types';

const SAMPLE: PackageMap = {
  package: 'backend',
  root: '/repo/backend',
  generatedAt: '2026-05-09T10:00:00Z',
  model: 'claude-sonnet-4-5',
  modules: [
    {
      id: 'evaluations',
      path: 'backend/src/modules/evaluations',
      fileCount: 47,
      testFileCount: 12,
      exports: ['EvaluationsModule', 'OrchestratorService', 'PlanAgent'],
      internalDepsOut: ['llm', 'sessions'],
      internalDepsIn: [],
      externalDeps: ['@nestjs/common', '@anthropic-ai/sdk'],
      responsibility:
        'Coordinates plan and build phase evaluation flows, defined in `orchestrator.service.ts`.',
      testsFor: [],
    },
    {
      id: 'tiny',
      path: 'backend/src/tiny',
      fileCount: 1,
      testFileCount: 0,
      exports: [],
      internalDepsOut: [],
      internalDepsIn: ['evaluations'],
      externalDeps: [],
      synthesisError: 'rate-limited',
      testsFor: [],
    },
  ],
};

describe('renderPackageMarkdown', () => {
  it('emits a recognisable per-package markdown shape', () => {
    const out = renderPackageMarkdown(SAMPLE);
    expect(out).toContain('# backend module map');
    expect(out).toContain('Generated 2026-05-09T10:00:00Z (model: claude-sonnet-4-5)');
    expect(out).toContain('## Module: evaluations');
    expect(out).toContain('**Path:** `backend/src/modules/evaluations`');
    expect(out).toContain('**Files:** 47 (12 tests)');
    expect(out).toContain('**Key exports:** `EvaluationsModule`, `OrchestratorService`, `PlanAgent`');
    expect(out).toContain('**Depends on (internal):** llm, sessions');
    expect(out).toContain('**External:** `@nestjs/common`, `@anthropic-ai/sdk`');
    expect(out).toContain('**Responsibility:** Coordinates plan and build phase');
  });

  it('renders synthesis failures with an explicit marker', () => {
    const out = renderPackageMarkdown(SAMPLE);
    expect(out).toContain('## Module: tiny');
    expect(out).toContain('_(synthesis failed: rate-limited)_');
  });

  it('renders empty deps as _none_ rather than empty strings', () => {
    const out = renderPackageMarkdown(SAMPLE);
    expect(out).toContain('**Depended on by (internal):** _none_');
  });

  it('shows summary stats including orphan count and failure count', () => {
    const out = renderPackageMarkdown(SAMPLE);
    expect(out).toContain('**2** modules');
    expect(out).toContain('**48** source files + **12** test files');
    expect(out).toContain('**1** modules with no inbound internal deps');
    expect(out).toContain('**1** module(s) had a responsibility-synthesis failure');
  });

  it('marks unverified-citation responsibilities visibly', () => {
    const map: PackageMap = {
      ...SAMPLE,
      modules: [
        {
          ...SAMPLE.modules[0],
          responsibility: 'Does X with `bogus.ts`.',
          unverifiedCitation: true,
        },
      ],
    };
    const out = renderPackageMarkdown(map);
    expect(out).toContain('_(unverified citation)_');
  });
});
