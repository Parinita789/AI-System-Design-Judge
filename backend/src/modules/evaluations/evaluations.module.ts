import { Module } from '@nestjs/common';
import { EvaluationsController } from './handlers/evaluations.controller';
import { EvaluationsService } from './services/evaluations.service';
import { EvaluationsRepository } from './repositories/evaluations.repository';
import { OrchestratorService } from './services/orchestrator.service';
import { RubricLoaderService } from './services/rubric-loader.service';
import { PlanAgent } from './services/agents/plan.agent';
import { BuildAgent } from './services/agents/build.agent';
import { ValidateAgent } from './services/agents/validate.agent';
import { WrapAgent } from './services/agents/wrap.agent';
import { SynthesizerAgent } from './services/agents/synthesizer.agent';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { PhaseTaggerModule } from '../phase-tagger/phase-tagger.module';

@Module({
  imports: [ArtifactsModule, PhaseTaggerModule],
  controllers: [EvaluationsController],
  providers: [
    EvaluationsService,
    EvaluationsRepository,
    OrchestratorService,
    RubricLoaderService,
    PlanAgent,
    BuildAgent,
    ValidateAgent,
    WrapAgent,
    SynthesizerAgent,
  ],
  exports: [EvaluationsService],
})
export class EvaluationsModule {}
