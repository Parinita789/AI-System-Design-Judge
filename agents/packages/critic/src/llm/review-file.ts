import { CriticLlmClient } from './llm-client';
import { recordFileReviewTool } from './tool-schemas';
import { buildFileSystemPrompt, buildFileUserPrompt } from './file-review-prompt';
import {
  validateFileIssues,
  formatFaultsForRetry,
  SourceMapEntry,
  ValidationFault,
} from './validate-refs';
import { FileReview, MapperModuleSummary, PersistedFileReview } from '../types';
import { SourceFile } from '../load/read-source';

export interface ReviewFileOptions {
  client: CriticLlmClient;
  model: string;
  personaText: string;
  rubricText: string;
  pkg: string;
  module: MapperModuleSummary;
  source: SourceFile;
}

const MAX_TOKENS = 3000;

// Phase 1 worker: one LLM call + validate + at most one corrective
// retry. Always returns something the run can persist; an
// unrecoverable failure becomes synthesisError on the result.
export async function reviewOneFile(opts: ReviewFileOptions): Promise<PersistedFileReview> {
  const system = buildFileSystemPrompt({
    personaText: opts.personaText,
    rubricText: opts.rubricText,
  });
  const userBase = buildFileUserPrompt({
    personaText: opts.personaText,
    rubricText: opts.rubricText,
    pkg: opts.pkg,
    module: opts.module,
    source: opts.source,
  });

  const sourceEntry: SourceMapEntry = {
    repoPath: opts.source.repoPath,
    lineCount: opts.source.truncatedAfter,
  };

  const empty = (synthesisError: string | null): PersistedFileReview => ({
    pkg: opts.pkg,
    module: opts.module.id,
    file: opts.source.repoPath,
    review: emptyReview(opts.source.repoPath),
    unverifiedRefs: false,
    synthesisError,
  });

  let lastResult: FileReview | null = null;
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
        tool: recordFileReviewTool,
        toolChoice: 'force',
        maxTokens: MAX_TOKENS,
      });
      toolInput = response.toolInput;
    } catch (err) {
      synthesisError = `LLM call failed: ${(err as Error).message}`;
      break;
    }

    if (!toolInput) {
      synthesisError = `LLM did not emit a record_file_review tool call`;
      break;
    }

    const review = coerceFileReview(toolInput, opts.source.repoPath);
    lastResult = review;
    lastFaults = validateFileIssues(
      opts.source.repoPath,
      sourceEntry,
      review.issues,
      review.recommendations,
    );

    if (lastFaults.length === 0) {
      return {
        pkg: opts.pkg,
        module: opts.module.id,
        file: opts.source.repoPath,
        review,
        unverifiedRefs: false,
        synthesisError: null,
      };
    }

    // Retry once with a corrective addendum naming the bad refs.
    userPrompt = userBase + '\n\n' + formatFaultsForRetry(lastFaults);
  }

  if (lastResult) {
    return {
      pkg: opts.pkg,
      module: opts.module.id,
      file: opts.source.repoPath,
      review: lastResult,
      unverifiedRefs: true,
      synthesisError: null,
    };
  }
  return empty(synthesisError ?? 'unknown failure');
}

function coerceFileReview(input: Record<string, unknown>, fallbackFile: string): FileReview {
  return {
    file: typeof input.file === 'string' ? input.file : fallbackFile,
    summary: typeof input.summary === 'string' ? input.summary : '',
    strengths: arrayOfStrings(input.strengths),
    concerns: arrayOfObjects(input.concerns) as FileReview['concerns'],
    issues: arrayOfObjects(input.issues) as FileReview['issues'],
    recommendations: arrayOfObjects(input.recommendations) as FileReview['recommendations'],
  };
}

function arrayOfStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function arrayOfObjects<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

function emptyReview(file: string): FileReview {
  return {
    file,
    summary: '',
    strengths: [],
    concerns: [],
    issues: [],
    recommendations: [],
  };
}
