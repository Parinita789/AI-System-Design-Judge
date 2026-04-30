import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';

// Inputs for any phase agent's evaluate(). DB-shaped — the orchestrator
// loads these from sessions/snapshots/ai_interactions.
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
}

export abstract class BasePhaseAgent {
  protected abstract readonly phase: Phase;

  constructor(
    protected readonly llm: LlmService,
    protected readonly rubricLoader: RubricLoaderService,
  ) {}

  abstract evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult>;
}
