import { Injectable } from '@nestjs/common';
import { BasePhaseAgent } from './base-phase.agent';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { JsonlEntry, FinalArtifacts } from '../../../artifacts/models/artifacts.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';

@Injectable()
export class PlanAgent extends BasePhaseAgent {
  protected readonly phase: Phase = 'plan';

  evaluate(
    _entries: JsonlEntry[],
    _artifacts: FinalArtifacts,
    _rubricVersion: string,
  ): Promise<PhaseEvaluationResult> {
    throw new Error('Not implemented');
  }
}
