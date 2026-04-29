import { LlmService } from '../../../llm/services/llm.service';
import { RubricLoaderService } from '../rubric-loader.service';
import { JsonlEntry, FinalArtifacts } from '../../../artifacts/models/artifacts.types';
import { Phase } from '../../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../../models/evaluation.types';

export abstract class BasePhaseAgent {
  protected abstract readonly phase: Phase;

  constructor(
    protected readonly llm: LlmService,
    protected readonly rubricLoader: RubricLoaderService,
  ) {}

  abstract evaluate(
    entries: JsonlEntry[],
    artifacts: FinalArtifacts,
    rubricVersion: string,
  ): Promise<PhaseEvaluationResult>;
}
