import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';
import { Mode, Seniority } from '../../models/rubric.types';

export interface PhaseEvalInput {
  session: {
    id: string;
    prompt: string;
    startedAt: Date;
    endedAt: Date | null;
  };
  planMd: string | null;
  snapshots: Array<{
    takenAt: Date;
    elapsedMinutes: number;
    planMdSize: number;
  }>;
  hints: Array<{
    occurredAt: Date;
    elapsedMinutes: number;
    prompt: string;
    response: string;
  }>;
  rubricVersion: string;
  // v2.0+ rubric variant. Null/undefined on legacy v1.0 questions.
  mode?: Mode | null;
  // Per-attempt seniority calibration. When set, the loader resolves
  // per-signal weight_by_seniority maps to a single weight and the
  // prompt renders a calibration block.
  seniority?: Seniority | null;
  // Optional LLM model override for this evaluation call. When unset,
  // the active provider falls back to its env default (LLM_MODEL for
  // Anthropic, OLLAMA_MODEL for Ollama). The audit row records the
  // actual model the provider returned, so picks are always traceable.
  model?: string;
}

export abstract class BasePhaseAgent {
  protected abstract readonly phase: Phase;

  constructor(
    protected readonly llm: LlmService,
    protected readonly rubricLoader: RubricLoaderService,
  ) {}

  abstract evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult>;
}
