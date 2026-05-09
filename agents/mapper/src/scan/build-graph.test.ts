import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildGraph, invertEdges, FileWithImports } from './build-graph';
import { DiscoveredModule } from '../types';

function mkRepo(layout: Record<string, string>): { repoRoot: string; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graph-test-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(repoRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return {
    repoRoot,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe('buildGraph', () => {
  it('resolves a relative import to the owning module + records the dep', () => {
    const { repoRoot, cleanup } = mkRepo({
      'pkg/src/modules/evaluations/orchestrator.ts': '',
      'pkg/src/modules/llm/llm.service.ts': '',
    });
    try {
      const evaluationsAbs = path.join(repoRoot, 'pkg/src/modules/evaluations/orchestrator.ts');
      const llmAbs = path.join(repoRoot, 'pkg/src/modules/llm/llm.service.ts');
      const modules: DiscoveredModule[] = [
        {
          id: 'evaluations',
          path: 'pkg/src/modules/evaluations',
          files: [{ absPath: evaluationsAbs, repoPath: '...', isTest: false }],
        },
        {
          id: 'llm',
          path: 'pkg/src/modules/llm',
          files: [{ absPath: llmAbs, repoPath: '...', isTest: false }],
        },
      ];
      const filesByModule = new Map<string, FileWithImports[]>([
        [
          'evaluations',
          [{ absPath: evaluationsAbs, imports: ['../llm/llm.service'] }],
        ],
        ['llm', [{ absPath: llmAbs, imports: [] }]],
      ]);
      const edges = buildGraph(modules, filesByModule);
      expect(edges.get('evaluations')?.internalDepsOut).toEqual(['llm']);
      expect(edges.get('llm')?.internalDepsOut).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('resolves index.ts imports (path.resolve to <dir>/index.ts)', () => {
    const { repoRoot, cleanup } = mkRepo({
      'pkg/src/modules/evaluations/orchestrator.ts': '',
      'pkg/src/modules/llm/index.ts': '',
    });
    try {
      const fromAbs = path.join(repoRoot, 'pkg/src/modules/evaluations/orchestrator.ts');
      const llmIndex = path.join(repoRoot, 'pkg/src/modules/llm/index.ts');
      const modules: DiscoveredModule[] = [
        {
          id: 'evaluations',
          path: 'pkg/src/modules/evaluations',
          files: [{ absPath: fromAbs, repoPath: '...', isTest: false }],
        },
        {
          id: 'llm',
          path: 'pkg/src/modules/llm',
          files: [{ absPath: llmIndex, repoPath: '...', isTest: false }],
        },
      ];
      const filesByModule = new Map([
        ['evaluations', [{ absPath: fromAbs, imports: ['../llm'] }]],
        ['llm', [{ absPath: llmIndex, imports: [] }]],
      ]);
      const edges = buildGraph(modules, filesByModule);
      expect(edges.get('evaluations')?.internalDepsOut).toEqual(['llm']);
    } finally {
      cleanup();
    }
  });

  it('counts external npm imports + dedupes by package name (top-N capped)', () => {
    const { repoRoot, cleanup } = mkRepo({
      'pkg/src/m/a.ts': '',
    });
    try {
      const fromAbs = path.join(repoRoot, 'pkg/src/m/a.ts');
      const modules: DiscoveredModule[] = [
        {
          id: 'm',
          path: 'pkg/src/m',
          files: [{ absPath: fromAbs, repoPath: '...', isTest: false }],
        },
      ];
      const filesByModule = new Map([
        [
          'm',
          [
            {
              absPath: fromAbs,
              imports: [
                '@nestjs/common',
                '@nestjs/common/sub',
                '@nestjs/config',
                'axios',
                'axios/lib/x',
                'chokidar',
              ],
            },
          ],
        ],
      ]);
      const edges = buildGraph(modules, filesByModule);
      const ext = edges.get('m')?.externalDeps ?? [];
      expect(ext).toContain('@nestjs/common');
      expect(ext).toContain('axios');
      expect(ext).toContain('@nestjs/config');
      expect(ext).toContain('chokidar');
      // De-duped: only one '@nestjs/common', one 'axios'.
      expect(ext.filter((d) => d === '@nestjs/common').length).toBe(1);
      expect(ext.filter((d) => d === 'axios').length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('skips imports inside test files (test imports do not pollute the graph)', () => {
    const { repoRoot, cleanup } = mkRepo({
      'pkg/src/m/a.ts': '',
      'pkg/src/m/a.test.ts': '',
      'pkg/src/n/b.ts': '',
    });
    try {
      const aAbs = path.join(repoRoot, 'pkg/src/m/a.ts');
      const aTestAbs = path.join(repoRoot, 'pkg/src/m/a.test.ts');
      const bAbs = path.join(repoRoot, 'pkg/src/n/b.ts');
      const modules: DiscoveredModule[] = [
        {
          id: 'm',
          path: 'pkg/src/m',
          files: [
            { absPath: aAbs, repoPath: '...', isTest: false },
            { absPath: aTestAbs, repoPath: '...', isTest: true },
          ],
        },
        {
          id: 'n',
          path: 'pkg/src/n',
          files: [{ absPath: bAbs, repoPath: '...', isTest: false }],
        },
      ];
      const filesByModule = new Map([
        [
          'm',
          [
            { absPath: aAbs, imports: [] },
            { absPath: aTestAbs, imports: ['../n/b'] }, // test-only import
          ],
        ],
        ['n', [{ absPath: bAbs, imports: [] }]],
      ]);
      const edges = buildGraph(modules, filesByModule);
      // The test's import of n/b should NOT show up as m → n.
      expect(edges.get('m')?.internalDepsOut).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe('invertEdges', () => {
  it('produces depsIn from depsOut', () => {
    const edges = new Map([
      ['a', { internalDepsOut: ['b', 'c'], externalDeps: [] }],
      ['b', { internalDepsOut: ['c'], externalDeps: [] }],
      ['c', { internalDepsOut: [], externalDeps: [] }],
    ]);
    const inbound = invertEdges(edges);
    expect(inbound.get('c')?.sort()).toEqual(['a', 'b']);
    expect(inbound.get('b')).toEqual(['a']);
    expect(inbound.get('a')).toBeUndefined();
  });
});
