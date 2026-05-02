import { Injectable } from '@nestjs/common';
import { BasePhaseAgent } from './base-phase.agent';
import { PhaseEvalInput } from '../types/evaluation.types';
import { Phase } from '../../phase-tagger/types/phase.types';
import { PhaseEvaluationResult } from '../types/evaluation.types';
import { LlmService } from '../../llm/services/llm.service';
import { RubricLoaderService } from '../services/rubric-loader.service';

@Injectable()
export class ValidateAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'validate';

  constructor(llm: LlmService, rubricLoader: RubricLoaderService) {
    super(llm, rubricLoader);
  }

  evaluate(_input: PhaseEvalInput): Promise<PhaseEvaluationResult> {
    throw new Error('Not implemented');
  }
}
