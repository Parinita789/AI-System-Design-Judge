import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverModules } from './discover-modules';
import { PackageDescriptor } from '../types';

function mkRepo(layout: Record<string, string>): { repoRoot: string; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mapper-test-'));
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

describe('discoverModules — nest strategy', () => {
  it('returns one module per child of src/modules/ + infra dirs + eval-harness + scripts', () => {
    const { repoRoot, cleanup } = mkRepo({
      'backend/src/modules/evaluations/services/orchestrator.service.ts': '',
      'backend/src/modules/evaluations/agents/plan.agent.ts': '',
      'backend/src/modules/llm/services/llm.service.ts': '',
      'backend/src/common/background-task-tracker.service.ts': '',
      'backend/src/config/configuration.ts': '',
      'backend/src/database/prisma.service.ts': '',
      'backend/src/app.module.ts': '',
      'backend/src/main.ts': '',
      'backend/eval-harness/run.ts': '',
      'backend/scripts/migrate.ts': '',
    });
    try {
      const pkg: PackageDescriptor = {
        name: 'backend',
        root: path.join(repoRoot, 'backend'),
        moduleStrategy: 'nest',
      };
      const modules = discoverModules(pkg, repoRoot);
      const ids = modules.map((m) => m.id).sort();
      expect(ids).toEqual([
        '_root',
        'common',
        'config',
        'database',
        'eval-harness',
        'evaluations',
        'llm',
        'scripts',
      ]);
      const evals = modules.find((m) => m.id === 'evaluations')!;
      expect(evals.files.map((f) => f.repoPath).sort()).toEqual([
        'backend/src/modules/evaluations/agents/plan.agent.ts',
        'backend/src/modules/evaluations/services/orchestrator.service.ts',
      ]);
      const root = modules.find((m) => m.id === '_root')!;
      expect(root.files.map((f) => f.repoPath).sort()).toEqual([
        'backend/src/app.module.ts',
        'backend/src/main.ts',
      ]);
    } finally {
      cleanup();
    }
  });
});

describe('discoverModules — frontend strategy', () => {
  it('mixes feature dirs, page dirs, per-file services, and single-dir support modules', () => {
    const { repoRoot, cleanup } = mkRepo({
      'frontend/src/features/dashboard/index.tsx': '',
      'frontend/src/features/sessions/SessionView.tsx': '',
      'frontend/src/pages/SessionResults/SessionResultsPage.tsx': '',
      'frontend/src/services/sessions.service.ts': '',
      'frontend/src/services/questions.service.ts': '',
      'frontend/src/components/Button.tsx': '',
      'frontend/src/store/sessionStore.ts': '',
      'frontend/src/types/question.ts': '',
      'frontend/src/main.tsx': '',
    });
    try {
      const pkg: PackageDescriptor = {
        name: 'frontend',
        root: path.join(repoRoot, 'frontend'),
        moduleStrategy: 'frontend',
      };
      const modules = discoverModules(pkg, repoRoot);
      const ids = modules.map((m) => m.id).sort();
      expect(ids).toEqual([
        '_root',
        'components',
        'features/dashboard',
        'features/sessions',
        'pages/SessionResults',
        'services/questions',
        'services/sessions',
        'store',
        'types',
      ]);
    } finally {
      cleanup();
    }
  });
});

describe('discoverModules — cli-flat strategy', () => {
  it('treats each non-test file under cli/src/ as a module + records tests-for', () => {
    const { repoRoot, cleanup } = mkRepo({
      'cli/src/index.ts': '',
      'cli/src/watch.ts': '',
      'cli/src/watch.test.ts': '',
      'cli/src/buffer.ts': '',
      'cli/src/buffer.test.ts': '',
      'cli/src/diff.ts': '',
    });
    try {
      const pkg: PackageDescriptor = {
        name: 'cli',
        root: path.join(repoRoot, 'cli'),
        moduleStrategy: 'cli-flat',
      };
      const modules = discoverModules(pkg, repoRoot);
      expect(modules.map((m) => m.id).sort()).toEqual(['buffer', 'diff', 'index', 'watch']);
      const watch = modules.find((m) => m.id === 'watch')!;
      expect(watch.files.length).toBe(2);
      const test = watch.files.find((f) => f.isTest)!;
      expect(test.repoPath).toBe('cli/src/watch.test.ts');
      const buffer = modules.find((m) => m.id === 'buffer')!;
      expect(buffer.files.find((f) => f.isTest)?.repoPath).toBe('cli/src/buffer.test.ts');
    } finally {
      cleanup();
    }
  });
});
