import { PackageMap } from '../types';

export function renderIndex(maps: PackageMap[], generatedAt: string, model?: string): string {
  const lines: string[] = [];
  lines.push('# Codebase map');
  lines.push('');
  lines.push(`_Generated ${generatedAt}${model ? ` (model: ${model})` : ''} by codebase-mapper._`);
  lines.push('');
  lines.push('Per-package maps:');
  lines.push('');
  for (const map of maps) {
    const totalFiles = map.modules.reduce((sum, m) => sum + m.fileCount, 0);
    lines.push(
      `- [${map.package}](./${map.package}.md) — ${map.modules.length} modules, ${totalFiles} files`,
    );
  }
  lines.push('');
  lines.push('## Reading the map');
  lines.push('');
  lines.push(
    'Each module section lists its directory path, file counts, top exports, ' +
      'within-package dependencies in both directions, and the most-used external ' +
      'npm packages. The "Responsibility" paragraph is LLM-generated from the ' +
      'structural facts plus excerpts from up to 5 key files; it cites at least ' +
      'one supplied file by name.',
  );
  lines.push('');
  lines.push(
    'Cross-package dependencies (e.g. frontend → backend HTTP, cli → backend HTTP) ' +
      'are not modeled in this version.',
  );
  return lines.join('\n');
}
