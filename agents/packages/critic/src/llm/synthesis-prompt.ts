import { PersistedModuleReview } from '../types';
import { GraphsByPackage } from '../load/load-graphs';
import { CondensedEndpoint } from '../load/load-api-flow';

export interface BuildSynthesisPromptInput {
  personaText: string;
  rubricText: string;
  moduleReviews: PersistedModuleReview[];
  architectureMd: string | null;
  schemaMd: string | null;
  graphs: GraphsByPackage;
  apiFlow: CondensedEndpoint[] | null;
}

export function buildSynthesisSystemPrompt(input: {
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
    'You are producing the overall codebase health summary. Emit exactly one `record_synthesis` tool call. Do not include prose alongside it.',
    '',
    'Rules:',
    '- `crossCuttingPatterns` must affect 2+ modules. Patterns confined to one module do not count.',
    '- `affectedModules` and `highPriorityItems[].module` must reference module ids that appear in the supplied module-review list.',
    '- Be honest about severity. Most codebases are not A. Reserve F for systemic, untrustworthy code.',
    '- Top risks + strengths should each have 3–7 concrete bullets, not vague generalities.',
    '- The narrative should anchor in specific findings from the module reviews, not summarize the rubric.',
  ].join('\n');
}

export function buildSynthesisUserPrompt(input: BuildSynthesisPromptInput): string {
  const reviewPayloads = input.moduleReviews.map((mr) => ({
    pkg: mr.pkg,
    module: mr.module,
    summary: mr.review.summary,
    strengths: mr.review.strengths,
    concerns: mr.review.concerns,
    issues: mr.review.issues,
    crossFilePatterns: mr.review.crossFilePatterns,
    recommendations: mr.review.recommendations,
    ...(mr.unverifiedRefs ? { unverifiedRefs: true } : {}),
    ...(mr.synthesisError ? { synthesisError: mr.synthesisError } : {}),
  }));

  const sections: string[] = [];

  sections.push('# Global context');

  if (input.architectureMd) {
    sections.push('## System architecture\n\n' + input.architectureMd.trim());
  }
  if (input.schemaMd) {
    sections.push('## Database schema\n\n' + input.schemaMd.trim());
  }

  const graphBlocks: string[] = [];
  for (const pkg of Object.keys(input.graphs) as Array<keyof GraphsByPackage>) {
    const g = input.graphs[pkg];
    if (g) {
      graphBlocks.push(`### ${pkg}\n\n\`\`\`mermaid\n${g}\n\`\`\``);
    }
  }
  if (graphBlocks.length) {
    sections.push('## Module relationship graphs\n\n' + graphBlocks.join('\n\n'));
  }

  if (input.apiFlow && input.apiFlow.length) {
    const lines = input.apiFlow.map((e) => {
      const callPath = e.callPathTop2.join(' -> ');
      const cli = e.cliCommands.length ? ` [CLI: ${e.cliCommands.join(', ')}]` : '';
      return `- ${e.route}  in module **${e.module}**  ${callPath}${cli}`;
    });
    sections.push('## API flow (condensed)\n\n' + lines.join('\n'));
  }

  sections.push('# Module reviews (JSON)');
  sections.push('```json\n' + JSON.stringify(reviewPayloads, null, 2) + '\n```');

  return sections.join('\n\n');
}
