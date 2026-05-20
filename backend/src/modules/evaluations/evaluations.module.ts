import { Module } from '@nestjs/common';
import { EvaluationsController } from './handlers/evaluations.controller';
import { RubricsController } from './handlers/rubrics.controller';
import { EvaluationsService } from './services/evaluations.service';
import { EvaluationsRepository } from './repositories/evaluations.repository';
import { OrchestratorService } from './services/orchestrator.service';
import { BuildContextService } from './services/build-context.service';
import { RubricLoaderService } from './services/rubric-loader.service';
import { PlanAgent } from './agents/plan.agent';
import { BuildAgent } from './agents/build.agent';
import { ValidateAgent } from './agents/validate.agent';
import { WrapAgent } from './agents/wrap.agent';
import { SynthesizerAgent } from './agents/synthesizer.agent';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { PhaseTaggerModule } from '../phase-tagger/phase-tagger.module';
import { SessionReadModule } from '../session-read/session-read.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { HintsModule } from '../hints/hints.module';
import { BuildSessionsDataModule } from '../build-sessions-data/build-sessions-data.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ArtifactsModule,
    PhaseTaggerModule,
    SnapshotsModule,
    HintsModule,
    SessionReadModule,
    BuildSessionsDataModule,
    AuthModule,
  ],
  controllers: [EvaluationsController, RubricsController],
  providers: [
    EvaluationsService,
    EvaluationsRepository,
    OrchestratorService,
    BuildContextService,
    RubricLoaderService,
    PlanAgent,
    BuildAgent,
    ValidateAgent,
    WrapAgent,
    SynthesizerAgent,
  ],
  exports: [
    EvaluationsService,
    EvaluationsRepository,
    RubricLoaderService,
    OrchestratorService,
    BuildContextService,
  ],
})
export class EvaluationsModule {}
