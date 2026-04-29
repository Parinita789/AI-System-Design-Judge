import { Injectable } from '@nestjs/common';
import { PlanAgent } from './agents/plan.agent';
import { BuildAgent } from './agents/build.agent';
import { ValidateAgent } from './agents/validate.agent';
import { WrapAgent } from './agents/wrap.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { ArtifactsService } from '../../artifacts/services/artifacts.service';
import { PhaseTaggerService } from '../../phase-tagger/services/phase-tagger.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly planAgent: PlanAgent,
    private readonly buildAgent: BuildAgent,
    private readonly validateAgent: ValidateAgent,
    private readonly wrapAgent: WrapAgent,
    private readonly synthesizer: SynthesizerAgent,
    private readonly artifacts: ArtifactsService,
    private readonly phaseTagger: PhaseTaggerService,
    private readonly evaluationsRepository: EvaluationsRepository,
  ) {}

  // Run 4 phase agents via Promise.all, then synthesize. See decisions.md §3.
  run(_sessionId: string): Promise<void> {
    throw new Error('Not implemented');
  }
}
