import { ModuleSummary, PackageMap } from '../types';

export function renderPackageMarkdown(map: PackageMap): string {
  const out: string[] = [];
  out.push(`# ${map.package} module map`);
  out.push('');
  out.push(`_Generated ${map.generatedAt}${map.model ? ` (model: ${map.model})` : ''}_`);
  out.push('');
  out.push(renderSummary(map));
  out.push('');
  for (const m of map.modules) {
    out.push(renderModule(m));
    out.push('');
  }
  return out.join('\n');
}

function renderSummary(map: PackageMap): string {
  const lines: string[] = [];
  const totalFiles = map.modules.reduce((sum, m) => sum + m.fileCount, 0);
  const totalTests = map.modules.reduce((sum, m) => sum + m.testFileCount, 0);
  const orphans = map.modules.filter((m) => m.internalDepsIn.length === 0).length;
  const synthFails = map.modules.filter((m) => m.synthesisError !== undefined).length;
  const unverified = map.modules.filter((m) => m.unverifiedCitation).length;

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **${map.modules.length}** modules`);
  lines.push(`- **${totalFiles}** source files + **${totalTests}** test files`);
  lines.push(`- **${orphans}** modules with no inbound internal deps (entry points / leaves)`);
  if (synthFails > 0) {
    lines.push(`- **${synthFails}** module(s) had a responsibility-synthesis failure`);
  }
  if (unverified > 0) {
    lines.push(`- **${unverified}** module(s) responsibility paragraph carries an unverified citation`);
  }
  return lines.join('\n');
}

function renderModule(m: ModuleSummary): string {
  const lines: string[] = [];
  lines.push(`## Module: ${m.id}`);
  lines.push('');
  lines.push(`**Path:** \`${m.path}\``);
  lines.push(`**Files:** ${m.fileCount}${m.testFileCount > 0 ? ` (${m.testFileCount} tests)` : ''}`);
  if (m.exports.length > 0) {
    const top = m.exports.slice(0, 8);
    const more = m.exports.length > top.length ? `, +${m.exports.length - top.length} more` : '';
    lines.push(`**Key exports:** ${top.map((e) => `\`${e}\``).join(', ')}${more}`);
  } else {
    lines.push(`**Key exports:** _none_`);
  }
  lines.push(`**Depends on (internal):** ${formatList(m.internalDepsOut)}`);
  lines.push(`**Depended on by (internal):** ${formatList(m.internalDepsIn)}`);
  lines.push(`**External:** ${formatList(m.externalDeps, '`')}`);
  lines.push('');

  if (m.responsibility !== undefined) {
    const marker = m.unverifiedCitation ? ' _(unverified citation)_' : '';
    lines.push(`**Responsibility:**${marker} ${m.responsibility}`);
  } else if (m.synthesisError) {
    lines.push(`**Responsibility:** _(synthesis failed: ${m.synthesisError})_`);
  }
  return lines.join('\n');
}

function formatList(items: string[], wrap?: string): string {
  if (items.length === 0) return '_none_';
  if (wrap) return items.map((i) => `${wrap}${i}${wrap}`).join(', ');
  return items.join(', ');
}
