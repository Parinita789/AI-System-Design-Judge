import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverPackages, packageByName } from './discover-packages';

function mkRepo(dirs: string[]): { repoRoot: string; cleanup: () => void } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-pkg-'));
  for (const d of dirs) fs.mkdirSync(path.join(repoRoot, d), { recursive: true });
  return {
    repoRoot,
    cleanup: () => fs.rmSync(repoRoot, { recursive: true, force: true }),
  };
}

describe('discoverPackages', () => {
  it('returns all three packages when each directory exists', () => {
    const { repoRoot, cleanup } = mkRepo(['backend', 'frontend', 'cli']);
    try {
      const pkgs = discoverPackages(repoRoot);
      expect(pkgs.map((p) => p.name).sort()).toEqual(['backend', 'cli', 'frontend']);
      expect(pkgs.find((p) => p.name === 'backend')?.moduleStrategy).toBe('nest');
      expect(pkgs.find((p) => p.name === 'frontend')?.moduleStrategy).toBe('frontend');
      expect(pkgs.find((p) => p.name === 'cli')?.moduleStrategy).toBe('cli-flat');
    } finally {
      cleanup();
    }
  });

  it('skips packages whose directory does not exist', () => {
    const { repoRoot, cleanup } = mkRepo(['backend']);
    try {
      const pkgs = discoverPackages(repoRoot);
      expect(pkgs.map((p) => p.name)).toEqual(['backend']);
    } finally {
      cleanup();
    }
  });

  it('returns absolute roots resolved against repoRoot', () => {
    const { repoRoot, cleanup } = mkRepo(['backend']);
    try {
      const pkgs = discoverPackages(repoRoot);
      expect(pkgs[0].root).toBe(path.resolve(repoRoot, 'backend'));
      expect(path.isAbsolute(pkgs[0].root)).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('returns an empty list when no packages are present', () => {
    const { repoRoot, cleanup } = mkRepo([]);
    try {
      expect(discoverPackages(repoRoot)).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it('does not treat a non-directory entry at the package path as a package', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-pkg-'));
    try {
      fs.writeFileSync(path.join(repoRoot, 'backend'), 'oops not a dir');
      expect(discoverPackages(repoRoot)).toEqual([]);
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});

describe('packageByName', () => {
  it('returns the matching descriptor or undefined', () => {
    const { repoRoot, cleanup } = mkRepo(['backend', 'frontend']);
    try {
      const pkgs = discoverPackages(repoRoot);
      expect(packageByName(pkgs, 'backend')?.name).toBe('backend');
      expect(packageByName(pkgs, 'missing')).toBeUndefined();
    } finally {
      cleanup();
    }
  });
});
