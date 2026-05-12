import { CriticLlmClient } from './llm-client';
import { recordModuleReviewTool } from './tool-schemas';
import {
  buildModuleSystemPrompt,
  buildModuleUserPrompt,
} from './module-rollup-prompt';
import {
  validateModuleIssues,
  formatFaultsForRetry,
  SourceMapEntry,
  ValidationFault,
} from './validate-refs';
import {
  MapperModuleSummary,
  ModuleReview,
  PersistedFileReview,
  PersistedModuleReview,
} from '../types';

export interface ReviewModuleOptions {
  client: CriticLlmClient;
  model: string;
  personaText: string;
  rubricText: string;
  pkg: string;
  module: MapperModuleSummary;
  fileReviews: PersistedFileReview[];
  // file path -> source-entry (line count from the actually-sent
  // source, post-truncation). Used to validate issues[].lines.
  sourceMap: Map<string, SourceMapEntry>;
}

const MAX_TOKENS = 4096;

export async function reviewOneModule(
  opts: ReviewModuleOptions,
): Promise<PersistedModuleReview> {
  const system = buildModuleSystemPrompt({
    personaText: opts.personaText,
    rubricText: opts.rubricText,
  });
  const userBase = buildModuleUserPrompt({
    personaText: opts.personaText,
    rubricText: opts.rubricText,
    pkg: opts.pkg,
    module: opts.module,
    fileReviews: opts.fileReviews,
  });

  const empty = (synthesisError: string | null): PersistedModuleReview => ({
    pkg: opts.pkg,
    module: opts.module.id,
    review: emptyModuleReview(opts.module.id),
    unverifiedRefs: false,
    synthesisError,
    fileReviews: opts.fileReviews,
    generatedAt: new Date().toISOString(),
  });

  let lastResult: ModuleReview | null = null;
  let lastFaults: ValidationFault[] = [];
  let userPrompt = userBase;
  let synthesisError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let toolInput: Record<string, unknown> | undefined;
    try {
      const response = await opts.client.call({
        systemPrompt: system,
        userPrompt,
        model: opts.model,
        tool: recordModuleReviewTool,
        toolChoice: 'force',
        maxTokens: MAX_TOKENS,
      });
      toolInput = response.toolInput;
    } catch (err) {
      synthesisError = `LLM call failed: ${(err as Error).message}`;
      break;
    }

    if (!toolInput) {
      synthesisError = `LLM did not emit a record_module_review tool call`;
      break;
    }

    const review = coerceModuleReview(toolInput, opts.module.id);
    lastResult = review;
    lastFaults = validateModuleIssues(opts.sourceMap, review.issues, review.recommendations);

    if (lastFaults.length === 0) {
      return {
        pkg: opts.pkg,
        module: opts.module.id,
        review,
        unverifiedRefs: false,
        synthesisError: null,
        fileReviews: opts.fileReviews,
        generatedAt: new Date().toISOString(),
      };
    }
    userPrompt = userBase + '\n\n' + formatFaultsForRetry(lastFaults);
  }

  if (lastResult) {
    return {
      pkg: opts.pkg,
      module: opts.module.id,
      review: lastResult,
      unverifiedRefs: true,
      synthesisError: null,
      fileReviews: opts.fileReviews,
      generatedAt: new Date().toISOString(),
    };
  }
  return empty(synthesisError ?? 'unknown failure');
}

function coerceModuleReview(input: Record<string, unknown>, moduleId: string): ModuleReview {
  return {
    module: typeof input.module === 'string' ? input.module : moduleId,
    summary: typeof input.summary === 'string' ? input.summary : '',
    strengths: arrayOfStrings(input.strengths),
    concerns: arrayOfObjects(input.concerns) as ModuleReview['concerns'],
    issues: arrayOfObjects(input.issues) as ModuleReview['issues'],
    crossFilePatterns: arrayOfObjects(input.crossFilePatterns) as ModuleReview['crossFilePatterns'],
    recommendations: arrayOfObjects(input.recommendations) as ModuleReview['recommendations'],
  };
}

function arrayOfStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function arrayOfObjects<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

function emptyModuleReview(moduleId: string): ModuleReview {
  return {
    module: moduleId,
    summary: '',
    strengths: [],
    concerns: [],
    issues: [],
    crossFilePatterns: [],
    recommendations: [],
  };
}
