import { CriticLlmClient } from './llm-client';
import { recordSynthesisTool } from './tool-schemas';
import {
  buildSynthesisSystemPrompt,
  buildSynthesisUserPrompt,
  BuildSynthesisPromptInput,
} from './synthesis-prompt';
import {
  validateSynthesis,
  formatFaultsForRetry,
  ValidationFault,
} from './validate-refs';
import { PersistedSynthesis, Synthesis } from '../types';

export interface SynthesizeOptions extends BuildSynthesisPromptInput {
  client: CriticLlmClient;
  model: string;
}

const MAX_TOKENS = 4096;

export async function synthesizeGlobal(opts: SynthesizeOptions): Promise<PersistedSynthesis> {
  const system = buildSynthesisSystemPrompt({
    personaText: opts.personaText,
    rubricText: opts.rubricText,
  });
  const userBase = buildSynthesisUserPrompt(opts);

  const knownModules = new Set<string>();
  for (const mr of opts.moduleReviews) {
    knownModules.add(mr.module);
    knownModules.add(`${mr.pkg}/${mr.module}`);
  }

  const empty = (synthesisError: string | null): PersistedSynthesis => ({
    synthesis: emptySynthesis(),
    generatedAt: new Date().toISOString(),
    unverifiedRefs: false,
    synthesisError,
  });

  let lastResult: Synthesis | null = null;
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
        tool: recordSynthesisTool,
        toolChoice: 'force',
        maxTokens: MAX_TOKENS,
      });
      toolInput = response.toolInput;
    } catch (err) {
      synthesisError = `LLM call failed: ${(err as Error).message}`;
      break;
    }

    if (!toolInput) {
      synthesisError = `LLM did not emit a record_synthesis tool call`;
      break;
    }

    const synth = coerceSynthesis(toolInput);
    lastResult = synth;
    lastFaults = validateSynthesis(knownModules, synth);

    if (lastFaults.length === 0) {
      return {
        synthesis: synth,
        generatedAt: new Date().toISOString(),
        unverifiedRefs: false,
        synthesisError: null,
      };
    }
    userPrompt = userBase + '\n\n' + formatFaultsForRetry(lastFaults);
  }

  if (lastResult) {
    return {
      synthesis: lastResult,
      generatedAt: new Date().toISOString(),
      unverifiedRefs: true,
      synthesisError: null,
    };
  }
  return empty(synthesisError ?? 'unknown failure');
}

function coerceSynthesis(input: Record<string, unknown>): Synthesis {
  return {
    grade: (typeof input.grade === 'string' ? input.grade : 'C') as Synthesis['grade'],
    narrative: typeof input.narrative === 'string' ? input.narrative : '',
    topRisks: arrayOfStrings(input.topRisks),
    topStrengths: arrayOfStrings(input.topStrengths),
    crossCuttingPatterns: arrayOfObjects(
      input.crossCuttingPatterns,
    ) as Synthesis['crossCuttingPatterns'],
    highPriorityItems: arrayOfObjects(input.highPriorityItems) as Synthesis['highPriorityItems'],
  };
}

function arrayOfStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function arrayOfObjects<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as T[]) : [];
}

function emptySynthesis(): Synthesis {
  return {
    grade: 'C',
    narrative: '',
    topRisks: [],
    topStrengths: [],
    crossCuttingPatterns: [],
    highPriorityItems: [],
  };
}
