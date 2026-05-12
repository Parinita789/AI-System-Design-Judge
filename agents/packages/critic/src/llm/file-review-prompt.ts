import { MapperModuleSummary } from '../types';
import { SourceFile } from '../load/read-source';

// Phase-1 prompt builders. The system prompt is cached across the
// whole run (persona + rubric are stable). The user prompt is
// per-file: module structural facts + the file source with line
// numbers.

export interface BuildFilePromptInput {
  personaText: string;
  rubricText: string;
  pkg: string;
  module: MapperModuleSummary;
  source: SourceFile;
}

export function buildFileSystemPrompt(input: { personaText: string; rubricText: string }): string {
  return [
    '# Role',
    '',
    input.personaText.trim(),
    '',
    '# Rubric',
    '',
    input.rubricText.trim(),
    '',
    '# Output',
    '',
    'Emit exactly one `record_file_review` tool call. Do not include any prose alongside it.',
    'Cite issues by 1-indexed line numbers from the supplied source. Use only the axes named in the rubric.',
    'The `fingerprint` field must be the same wording you would use for the same defect on a future run.',
    'If you cannot find substantive issues, return empty arrays — do not invent issues to fill space.',
  ].join('\n');
}

export function buildFileUserPrompt(input: BuildFilePromptInput): string {
  const { pkg, module, source } = input;
  const responsibility = module.responsibility?.trim() || '_(no responsibility paragraph available)_';
  const depsOut = module.internalDepsOut.length ? module.internalDepsOut.join(', ') : '_(none)_';
  const depsIn = module.internalDepsIn.length ? module.internalDepsIn.join(', ') : '_(none)_';
  const externalDeps = module.externalDeps.length
    ? module.externalDeps.slice(0, 8).join(', ')
    : '_(none)_';

  const truncationNote = source.truncated
    ? `\n_(file truncated after line ${source.truncatedAfter}; original length ${source.lineCount} lines)_\n`
    : '';

  return [
    `# File under review`,
    ``,
    `**Package:** ${pkg}`,
    `**Module:** ${module.id} (\`${module.path}\`)`,
    `**Responsibility:** ${responsibility}`,
    `**Depends on (internal):** ${depsOut}`,
    `**Depended on by (internal):** ${depsIn}`,
    `**External:** ${externalDeps}`,
    ``,
    `**File:** \`${source.repoPath}\` (${source.lineCount} lines)`,
    truncationNote,
    `\`\`\``,
    source.withLineNumbers,
    `\`\`\``,
  ].join('\n');
}
