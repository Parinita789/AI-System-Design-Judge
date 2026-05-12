import * as fs from 'node:fs';
import * as path from 'node:path';
import { DiscoveredModule, ModuleFile, PackageDescriptor } from '../types';

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '.git',
]);

// Files counted as part of a module. .tsx is included for frontend.
const SOURCE_EXT = /\.(?:tsx?|mts|cts)$/;
const TEST_NAME = /\.(?:test|spec)\.(?:tsx?)$/;

export function discoverModules(pkg: PackageDescriptor, repoRoot: string): DiscoveredModule[] {
  const raw = (() => {
    switch (pkg.moduleStrategy) {
      case 'nest':
        return discoverNestModules(pkg, repoRoot);
      case 'frontend':
        return discoverFrontendModules(pkg, repoRoot);
      case 'cli-flat':
        return discoverCliFlatModules(pkg, repoRoot);
    }
  })();
  // Drop modules with zero non-test source files. Empty directories
  // (e.g. frontend/src/features/dashboard/ that exists but hasn't
  // been populated yet) shouldn't pollute the map or inflate the
  // orphan count. If/when the dir gets source files, the next
  // mapper run picks it up automatically.
  return raw.filter((m) => m.files.some((f) => !f.isTest));
}

// -------------------- NEST (backend) -------------------- //

function discoverNestModules(pkg: PackageDescriptor, repoRoot: string): DiscoveredModule[] {
  const modules: DiscoveredModule[] = [];
  const srcDir = path.join(pkg.root, 'src');

  // Each child of src/modules/ is a module.
  const modulesDir = path.join(srcDir, 'modules');
  if (fs.existsSync(modulesDir)) {
    for (const name of listDirsSorted(modulesDir)) {
      const dir = path.join(modulesDir, name);
      modules.push({
        id: name,
        path: relFromRepo(repoRoot, dir),
        files: walkSourceFiles(dir, repoRoot),
      });
    }
  }

  // Three top-level infrastructure dirs.
  for (const name of ['common', 'config', 'database']) {
    const dir = path.join(srcDir, name);
    if (fs.existsSync(dir)) {
      modules.push({
        id: name,
        path: relFromRepo(repoRoot, dir),
        files: walkSourceFiles(dir, repoRoot),
      });
    }
  }

  // _root absorbs anything else loose under src/ (typically just
  // app.module.ts + main.ts). Keeps these from being orphaned.
  const rootFiles = listFiles(srcDir).filter(
    (f) => SOURCE_EXT.test(f) && fs.statSync(path.join(srcDir, f)).isFile(),
  );
  if (rootFiles.length > 0) {
    modules.push({
      id: '_root',
      path: relFromRepo(repoRoot, srcDir),
      files: rootFiles.map((f) => fileEntry(path.join(srcDir, f), repoRoot)),
    });
  }

  // eval-harness/ and scripts/ as separate modules — they're
  // independent entry points outside the Nest tree.
  for (const dirName of ['eval-harness', 'scripts']) {
    const dir = path.join(pkg.root, dirName);
    if (fs.existsSync(dir)) {
      modules.push({
        id: dirName,
        path: relFromRepo(repoRoot, dir),
        files: walkSourceFiles(dir, repoRoot),
      });
    }
  }

  return modules;
}

// -------------------- FRONTEND -------------------- //

function discoverFrontendModules(pkg: PackageDescriptor, repoRoot: string): DiscoveredModule[] {
  const modules: DiscoveredModule[] = [];
  const srcDir = path.join(pkg.root, 'src');
  if (!fs.existsSync(srcDir)) return modules;

  // features/<name>/ and pages/<name>/ — one module per child dir.
  for (const parent of ['features', 'pages']) {
    const parentDir = path.join(srcDir, parent);
    if (!fs.existsSync(parentDir)) continue;
    for (const name of listDirsSorted(parentDir)) {
      const dir = path.join(parentDir, name);
      modules.push({
        id: `${parent}/${name}`,
        path: relFromRepo(repoRoot, dir),
        files: walkSourceFiles(dir, repoRoot),
      });
    }
  }

  // services/<name>.service.ts — one module per file. Each is a
  // self-contained API client; treat the file as the module unit.
  // Co-located .test.ts files belong to the same module as their
  // target (foo.test.ts → services/foo), not separate modules.
  const servicesDir = path.join(srcDir, 'services');
  if (fs.existsSync(servicesDir)) {
    const allFiles = listFiles(servicesDir).sort();
    const sources = allFiles.filter((f) => SOURCE_EXT.test(f) && !TEST_NAME.test(f));
    const tests = allFiles.filter((f) => TEST_NAME.test(f));
    for (const f of sources) {
      const filePath = path.join(servicesDir, f);
      if (!fs.statSync(filePath).isFile()) continue;
      const sourceStem = f.replace(/\.service\.tsx?$/, '').replace(/\.tsx?$/, '');
      const id = `services/${sourceStem}`;
      const myTests = tests
        .filter((t) => {
          const testStem = t.replace(/\.(?:test|spec)\.tsx?$/, '').replace(/\.service$/, '');
          return testStem === sourceStem;
        })
        .map((t) => fileEntry(path.join(servicesDir, t), repoRoot));
      modules.push({
        id,
        path: relFromRepo(repoRoot, filePath),
        files: [fileEntry(filePath, repoRoot), ...myTests],
      });
    }
  }

  // Support directories at src/ level — each is a single module.
  for (const dirName of [
    'components',
    'hooks',
    'lib',
    'store',
    'utils',
    'types',
    'assets',
    'routes',
  ]) {
    const dir = path.join(srcDir, dirName);
    if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      modules.push({
        id: dirName,
        path: relFromRepo(repoRoot, dir),
        files: walkSourceFiles(dir, repoRoot),
      });
    }
  }

  // Anything loose under src/ (main.tsx, App.tsx) → _root.
  const rootFiles = listFiles(srcDir).filter(
    (f) => SOURCE_EXT.test(f) && fs.statSync(path.join(srcDir, f)).isFile(),
  );
  if (rootFiles.length > 0) {
    modules.push({
      id: '_root',
      path: relFromRepo(repoRoot, srcDir),
      files: rootFiles.map((f) => fileEntry(path.join(srcDir, f), repoRoot)),
    });
  }

  return modules;
}

// -------------------- CLI (flat) -------------------- //

function discoverCliFlatModules(pkg: PackageDescriptor, repoRoot: string): DiscoveredModule[] {
  const srcDir = path.join(pkg.root, 'src');
  if (!fs.existsSync(srcDir)) return [];

  // Each non-test file directly under cli/src/ is its own module.
  const files = listFiles(srcDir)
    .filter((f) => SOURCE_EXT.test(f))
    .filter((f) => fs.statSync(path.join(srcDir, f)).isFile())
    .sort();

  // Build the (testfile → target module) map by name convention:
  // foo.test.ts → foo, watch.test.ts → watch.
  const tests = files.filter((f) => TEST_NAME.test(f));
  const sources = files.filter((f) => !TEST_NAME.test(f));

  return sources.map((f) => {
    const id = f.replace(SOURCE_EXT, '');
    const filePath = path.join(srcDir, f);
    const myTests = tests
      .filter((t) => t.replace(/\.(?:test|spec)\.tsx?$/, '') === id)
      .map((t) => path.join(srcDir, t));

    return {
      id,
      path: relFromRepo(repoRoot, filePath),
      files: [
        fileEntry(filePath, repoRoot),
        ...myTests.map((p) => fileEntry(p, repoRoot)),
      ],
    };
  });
}

// -------------------- HELPERS -------------------- //

function walkSourceFiles(dir: string, repoRoot: string): ModuleFile[] {
  const out: ModuleFile[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        stack.push(path.join(cur, e.name));
      } else if (e.isFile() && SOURCE_EXT.test(e.name)) {
        out.push(fileEntry(path.join(cur, e.name), repoRoot));
      }
    }
  }
  // Stable order by repo-relative path.
  out.sort((a, b) => a.repoPath.localeCompare(b.repoPath));
  return out;
}

function fileEntry(absPath: string, repoRoot: string): ModuleFile {
  return {
    absPath,
    repoPath: relFromRepo(repoRoot, absPath),
    isTest: TEST_NAME.test(path.basename(absPath)),
  };
}

function listFiles(dir: string): string[] {
  return fs.readdirSync(dir);
}

function listDirsSorted(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name))
    .map((e) => e.name)
    .sort();
}

function relFromRepo(repoRoot: string, abs: string): string {
  return path.relative(repoRoot, abs);
}
