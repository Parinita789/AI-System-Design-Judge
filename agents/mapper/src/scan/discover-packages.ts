import * as path from 'node:path';
import * as fs from 'node:fs';
import { PackageDescriptor } from '../types';

// Hard-coded for this monorepo. A v2 could read a config file or
// scan for child package.json files; today the repo has exactly
// these three peers and they each need a different module-discovery
// strategy, so a config file would just be three rows of the same
// table.
const PACKAGE_DEFINITIONS: ReadonlyArray<Omit<PackageDescriptor, 'root'> & { dir: string }> = [
  { name: 'backend', dir: 'backend', moduleStrategy: 'nest' },
  { name: 'frontend', dir: 'frontend', moduleStrategy: 'frontend' },
  { name: 'cli', dir: 'cli', moduleStrategy: 'cli-flat' },
];

export function discoverPackages(repoRoot: string): PackageDescriptor[] {
  return PACKAGE_DEFINITIONS.flatMap((def) => {
    const root = path.resolve(repoRoot, def.dir);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return [];
    }
    return [{ name: def.name, root, moduleStrategy: def.moduleStrategy }];
  });
}

export function packageByName(
  packages: PackageDescriptor[],
  name: string,
): PackageDescriptor | undefined {
  return packages.find((p) => p.name === name);
}
