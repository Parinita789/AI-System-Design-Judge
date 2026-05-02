import { Injectable } from '@nestjs/common';
import { LlmService } from '../../llm/services/llm.service';
import { FinalArtifacts } from '../../artifacts/types/artifacts.types';
import { PhaseEvaluationResult, SynthesisResult } from '../types/evaluation.types';

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
