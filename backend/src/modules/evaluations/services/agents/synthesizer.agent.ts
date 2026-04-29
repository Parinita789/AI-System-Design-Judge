import { Injectable } from '@nestjs/common';
import { LlmService } from '../../../llm/services/llm.service';
import { FinalArtifacts } from '../../../artifacts/models/artifacts.types';
import { PhaseEvaluationResult, SynthesisResult } from '../../models/evaluation.types';

@Injectable()
export class SynthesizerAgent {
  constructor(private readonly llm: LlmService) {}

  synthesize(
    _evaluations: PhaseEvaluationResult[],
    _artifacts: FinalArtifacts,
  ): Promise<SynthesisResult> {
    throw new Error('Not implemented');
  }
}
