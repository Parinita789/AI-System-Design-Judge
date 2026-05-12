import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { enumerateModuleFiles } from './enumerate-files';
import { MapperModuleSummary } from '../types';

function makeTree(): { repoRoot: string; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'critic-enum-'));
  // Mirror the real backend layout that triggered the over-enumeration bug:
  //   backend/src/main.ts             <- _root file
  //   backend/src/app.module.ts       <- _root file
  //   backend/src/modules/hints/...   <- hints module
  //   backend/src/modules/evaluations/... <- evaluations module
  //   backend/src/common/foo.ts       <- common module
  const files = [
    'backend/src/main.ts',
    'backend/src/app.module.ts',
    'backend/src/modules/hints/orchestrator.ts',
    'backend/src/modules/hints/hints.service.ts',
    'backend/src/modules/evaluations/plan-agent.ts',
    'backend/src/common/foo.ts',
  ];
  for (const f of files) {
    const abs = path.join(repoRoot, f);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '// stub\n');
  }
  return { repoRoot, cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }) };
}

const summary = (id: string, p: string): MapperModuleSummary => ({
  id,
  path: p,
  fileCount: 0,
  testFileCount: 0,
  exports: [],
  internalDepsOut: [],
  internalDepsIn: [],
  externalDeps: [],
});

describe('enumerateModuleFiles', () => {
  it('returns the single file when path is a file', () => {
    const { repoRoot, cleanup } = makeTree();
    try {
      const files = enumerateModuleFiles(
        repoRoot,
        summary('hints', 'backend/src/modules/hints/orchestrator.ts'),
      );
      expect(files.map((f) => path.relative(repoRoot, f))).toEqual([
        'backend/src/modules/hints/orchestrator.ts',
      ]);
    } finally {
      cleanup();
    }
  });

  it('recursively walks a directory path', () => {
    const { repoRoot, cleanup } = makeTree();
    try {
      const files = enumerateModuleFiles(
        repoRoot,
        summary('hints', 'backend/src/modules/hints'),
      );
      expect(files.map((f) => path.relative(repoRoot, f)).sort()).toEqual([
        'backend/src/modules/hints/hints.service.ts',
        'backend/src/modules/hints/orchestrator.ts',
      ]);
    } finally {
      cleanup();
    }
  });

  it('respects excludeUnderPaths when walking', () => {
    // The _root case: path is backend/src; without exclusion it would
    // pick up every nested module's files. With the right exclusion
    // list, we get only the two top-level files.
    const { repoRoot, cleanup } = makeTree();
    try {
      const files = enumerateModuleFiles(repoRoot, summary('_root', 'backend/src'), {
        excludeUnderPaths: [
          'backend/src/modules/hints',
          'backend/src/modules/evaluations',
          'backend/src/common',
        ],
      });
      expect(files.map((f) => path.relative(repoRoot, f)).sort()).toEqual([
        'backend/src/app.module.ts',
        'backend/src/main.ts',
      ]);
    } finally {
      cleanup();
    }
  });

  it('without exclusions, _root would pick up everything (regression demo)', () => {
    const { repoRoot, cleanup } = makeTree();
    try {
      const files = enumerateModuleFiles(repoRoot, summary('_root', 'backend/src'));
      // 2 _root files + 2 hints + 1 evaluations + 1 common = 6
      expect(files.length).toBe(6);
    } finally {
      cleanup();
    }
  });
});
