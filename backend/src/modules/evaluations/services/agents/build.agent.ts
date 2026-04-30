import { Injectable } from '@nestjs/common';
import { BasePhaseAgent, PhaseEvalInput } from './base-phase.agent';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';
import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';

@Injectable()
export class BuildAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'build';

  constructor(llm: LlmService, rubricLoader: RubricLoaderService) {
    super(llm, rubricLoader);
  }

  evaluate(_input: PhaseEvalInput): Promise<PhaseEvaluationResult> {
    throw new Error('Not implemented');
  }
}
