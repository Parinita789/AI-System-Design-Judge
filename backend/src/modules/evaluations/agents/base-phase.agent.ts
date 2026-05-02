import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';
import { Mode, Seniority } from '../models/rubric.types';

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
  mode?: Mode | null;
  seniority?: Seniority | null;
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
