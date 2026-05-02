import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';
import { Phase } from '../../phase-tagger/types/phase.types';
import { PhaseEvalInput, PhaseEvaluationResult } from '../types/evaluation.types';

export abstract class BasePhaseAgent {
  protected abstract readonly phase: Phase;

  constructor(
    protected readonly llm: LlmService,
    protected readonly rubricLoader: RubricLoaderService,
  ) {}

  abstract evaluate(input: PhaseEvalInput): Promise<PhaseEvaluationResult>;
}
