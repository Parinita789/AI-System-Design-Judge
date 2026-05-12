import { MapperModuleSummary, PersistedFileReview } from '../types';

export interface BuildModulePromptInput {
  personaText: string;
  rubricText: string;
  pkg: string;
  module: MapperModuleSummary;
  fileReviews: PersistedFileReview[];
}

export function buildModuleSystemPrompt(input: {
  personaText: string;
  rubricText: string;
}): string {
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
    'You are rolling up file-level reviews into a single module-level review. ',
    'Emit exactly one `record_module_review` tool call. Do not include prose alongside it.',
    '',
    'Rules:',
    '- Carry forward only the most important per-file issues — drop noise.',
    '- Surface `crossFilePatterns` only when the same defect shape repeats across 2+ files in this module.',
    '- Every issue must reference a file that was supplied in the per-file reviews below.',
    '- Severity vocabulary: critical | high | medium | low | nit. Axes: as in the rubric.',
    '- Each issue keeps the same `fingerprint` it had at the file level (or a new canonical one for cross-file patterns).',
  ].join('\n');
}

export function buildModuleUserPrompt(input: BuildModulePromptInput): string {
  const { pkg, module, fileReviews } = input;
  const depsOut = module.internalDepsOut.length ? module.internalDepsOut.join(', ') : '_(none)_';
  const depsIn = module.internalDepsIn.length ? module.internalDepsIn.join(', ') : '_(none)_';
  const externalDeps = module.externalDeps.length
    ? module.externalDeps.slice(0, 8).join(', ')
    : '_(none)_';
  const responsibility = module.responsibility?.trim() || '_(no responsibility paragraph)_';

  const filePayloads = fileReviews.map((fr) => ({
    file: fr.file,
    summary: fr.review.summary,
    strengths: fr.review.strengths,
    concerns: fr.review.concerns,
    issues: fr.review.issues,
    recommendations: fr.review.recommendations,
    ...(fr.unverifiedRefs ? { unverifiedRefs: true } : {}),
    ...(fr.synthesisError ? { synthesisError: fr.synthesisError } : {}),
  }));

  return [
    `# Module under review`,
    ``,
    `**Package:** ${pkg}`,
    `**Module id:** ${module.id}`,
    `**Path:** \`${module.path}\``,
    `**Responsibility:** ${responsibility}`,
    `**Depends on (internal):** ${depsOut}`,
    `**Depended on by (internal):** ${depsIn}`,
    `**External:** ${externalDeps}`,
    `**Files reviewed:** ${fileReviews.length}`,
    ``,
    `# File-level reviews (JSON)`,
    ``,
    '```json',
    JSON.stringify(filePayloads, null, 2),
    '```',
  ].join('\n');
}
