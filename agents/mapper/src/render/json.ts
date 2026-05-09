import { PackageMap } from '../types';

export function renderPackageJson(map: PackageMap): string {
  // Stable shape for v2 critique consumers. Pretty-printed for
  // diff-friendliness; the map regenerates frequently and humans
  // will skim diffs.
  return JSON.stringify(map, null, 2) + '\n';
}
