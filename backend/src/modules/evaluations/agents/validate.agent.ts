import { Injectable } from '@nestjs/common';
import { BasePhaseAgent, PhaseEvalInput } from './base-phase.agent';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';
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
