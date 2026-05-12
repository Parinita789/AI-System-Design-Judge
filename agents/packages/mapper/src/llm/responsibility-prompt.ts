import { KeyFileSnippet } from '../scan/select-key-files';

// System prompt is constant across all per-module calls; sent with
// cache_control: ephemeral so subsequent calls in a single run pay
// the cached read price (~10% of fresh).
export function buildSystemPrompt(): string {
  return `You are a code archaeologist. Given structural facts about a single module
in a TypeScript codebase, infer in 2-3 sentences what the module is
responsible for. Do not critique. Do not suggest changes. Do not
speculate beyond the supplied facts.

Hard rules:
- Cite at least one file from the supplied "Key files" list by name
  (use the basename in backticks, e.g. \`orchestrator.service.ts\`).
- Do not name files or modules not present in the input.
- If the supplied facts are insufficient (e.g. fewer than 3 files
  and no meaningful exports), respond exactly: "Insufficient signal."
- Stay within 80 words.`;
}

export interface UserPromptInput {
  moduleId: string;
  modulePath: string;
  fileCount: number;
  exports: string[];
  internalDepsOut: string[];
  externalDeps: string[];
  keyFiles: KeyFileSnippet[];
}

export function buildUserPrompt(input: UserPromptInput): string {
  const lines: string[] = [];
  lines.push(`Module: ${input.moduleId}`);
  lines.push(`Path: ${input.modulePath}`);
  lines.push(`File count: ${input.fileCount}`);
  if (input.exports.length > 0) {
    lines.push(`Top exports: ${input.exports.slice(0, 8).join(', ')}`);
  } else {
    lines.push(`Top exports: (none — likely a re-export aggregator or single-default file)`);
  }
  if (input.internalDepsOut.length > 0) {
    lines.push(`Internal dependencies (modules this module imports from): ${input.internalDepsOut.join(', ')}`);
  } else {
    lines.push(`Internal dependencies: (none — leaf module)`);
  }
  if (input.externalDeps.length > 0) {
    lines.push(`External npm packages: ${input.externalDeps.join(', ')}`);
  }
  lines.push('');
  lines.push('Key files (truncated to 60 lines each):');
  for (const f of input.keyFiles) {
    lines.push('');
    lines.push(`--- ${f.repoPath} ---`);
    lines.push(f.snippet);
  }
  lines.push('');
  lines.push('Write the responsibility paragraph.');
  return lines.join('\n');
}

// Citation enforcement helper: extract candidate file references
// from the LLM's output and verify each appears in the supplied
// keyFiles list. Returns the set of references that ARE NOT in
// the input — empty set means no hallucinated citation.
export function findHallucinatedCitations(
  responsibilityText: string,
  keyFiles: KeyFileSnippet[],
): string[] {
  const allowed = new Set<string>();
  for (const f of keyFiles) {
    allowed.add(f.repoPath);
    const basename = f.repoPath.split('/').pop();
    if (basename) allowed.add(basename);
  }

  // Match anything in `backticks` that looks file-like:
  // contains a slash OR a dot followed by a known TS extension.
  const fileLikeInBackticks = /`([^`]*?(?:\.tsx?|\.mts|\.cts|\/[^`]+))`/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = fileLikeInBackticks.exec(responsibilityText)) !== null) {
    const candidate = m[1].trim();
    if (!allowed.has(candidate) && !allowed.has(candidate.split('/').pop() ?? '')) {
      found.push(candidate);
    }
  }
  return found;
}
