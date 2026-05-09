import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { selectKeyFiles } from './select-key-files';
import { DiscoveredModule, ModuleFile } from '../types';

function tmp(layout: Record<string, string>): { dir: string; file: (rel: string) => ModuleFile; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'keyfiles-'));
  for (const [rel, content] of Object.entries(layout)) {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return {
    dir,
    file: (rel: string) => ({
      absPath: path.join(dir, rel),
      repoPath: rel,
      isTest: /\.(test|spec)\.tsx?$/.test(rel),
    }),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

describe('selectKeyFiles', () => {
  it('prioritises *.module.ts over everything else', () => {
    const { file, cleanup } = tmp({
      'evaluations.module.ts': '/* tiny */',
      'big-helper.ts': 'X'.repeat(2000),
      'another.ts': 'X'.repeat(1500),
    });
    try {
      const m: DiscoveredModule = {
        id: 'evaluations',
        path: 'evaluations',
        files: [file('evaluations.module.ts'), file('big-helper.ts'), file('another.ts')],
      };
      const keys = selectKeyFiles(m);
      expect(keys[0].repoPath).toBe('evaluations.module.ts');
    } finally {
      cleanup();
    }
  });

  it('boosts files whose name contains the module id', () => {
    const { file, cleanup } = tmp({
      'unrelated.ts': 'X'.repeat(3000),
      'evaluations.service.ts': '// small',
      'helpers/math.ts': 'X'.repeat(500),
    });
    try {
      const m: DiscoveredModule = {
        id: 'evaluations',
        path: 'evaluations',
        files: [file('unrelated.ts'), file('evaluations.service.ts'), file('helpers/math.ts')],
      };
      const keys = selectKeyFiles(m);
      // Even though unrelated.ts is much larger, evaluations.service.ts
      // ranks first because of the name boost + the "service" boost.
      expect(keys[0].repoPath).toBe('evaluations.service.ts');
    } finally {
      cleanup();
    }
  });

  it('caps at 5 key files', () => {
    const layout: Record<string, string> = {};
    for (let i = 0; i < 12; i++) layout[`file-${i}.ts`] = 'X'.repeat(100 + i);
    const { file, cleanup } = tmp(layout);
    try {
      const m: DiscoveredModule = {
        id: 'm',
        path: '.',
        files: Object.keys(layout).map(file),
      };
      const keys = selectKeyFiles(m);
      expect(keys.length).toBe(5);
    } finally {
      cleanup();
    }
  });

  it('truncates snippet to 60 lines', () => {
    const longContent = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const { file, cleanup } = tmp({ 'big.ts': longContent });
    try {
      const m: DiscoveredModule = {
        id: 'm',
        path: '.',
        files: [file('big.ts')],
      };
      const keys = selectKeyFiles(m);
      const lines = keys[0].snippet.split('\n');
      expect(lines.length).toBeLessThanOrEqual(61); // 60 + the "// ..." marker
      expect(keys[0].snippet).toContain('// ...');
    } finally {
      cleanup();
    }
  });

  it('excludes test files from the candidate set', () => {
    const { file, cleanup } = tmp({
      'a.ts': '// small',
      'a.test.ts': 'X'.repeat(5000),
    });
    try {
      const m: DiscoveredModule = {
        id: 'm',
        path: '.',
        files: [file('a.ts'), file('a.test.ts')],
      };
      const keys = selectKeyFiles(m);
      expect(keys.map((k) => k.repoPath)).toEqual(['a.ts']);
    } finally {
      cleanup();
    }
  });

  it('returns an empty array for a module with no non-test files', () => {
    const { file, cleanup } = tmp({ 'a.test.ts': '' });
    try {
      const m: DiscoveredModule = {
        id: 'm',
        path: '.',
        files: [file('a.test.ts')],
      };
      expect(selectKeyFiles(m)).toEqual([]);
    } finally {
      cleanup();
    }
  });
});
