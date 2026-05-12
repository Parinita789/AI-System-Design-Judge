import { PersistedModuleReview } from '../types';
import { safeFilename } from './json-sidecar';

export interface RenderIndexInput {
  results: PersistedModuleReview[];
  persona: string;
  model: string;
  generatedAt: string;
  hasSynthesis: boolean;
}

export function renderIndexMarkdown(input: RenderIndexInput): string {
  const byPackage = new Map<string, PersistedModuleReview[]>();
  for (const r of input.results) {
    const list = byPackage.get(r.pkg) ?? [];
    list.push(r);
    byPackage.set(r.pkg, list);
  }

  const lines: string[] = [];
  lines.push(`# Codebase review index`);
  lines.push('');
  lines.push(
    `Persona: \`${input.persona}\` · model: \`${input.model}\` · generated ${input.generatedAt}`,
  );
  lines.push('');
  if (input.hasSynthesis) {
    lines.push(`- [Synthesis report](synthesis.md)`);
  }
  lines.push(`- [Cross-run issue tracker](issues.json)`);
  lines.push('');

  for (const [pkg, mods] of [...byPackage.entries()].sort()) {
    lines.push(`## ${pkg}`);
    lines.push('');
    for (const m of mods.sort((a, b) => a.module.localeCompare(b.module))) {
      const filename = `${safeFilename(pkg)}__${safeFilename(m.module)}.md`;
      const issueCount = m.review.issues.length;
      const flag = m.unverifiedRefs ? ' ⚠' : m.synthesisError ? ' ⚠' : '';
      lines.push(`- [\`${m.module}\`](per-module/${filename}) — ${issueCount} issue(s)${flag}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
