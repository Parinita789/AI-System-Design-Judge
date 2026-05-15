import { Module } from '@nestjs/common';
import { StartBuildController } from './handlers/start-build.controller';
import { BuildController } from './handlers/build.controller';
import { BuildSessionsService } from './services/build-sessions.service';
import { BuildTokenService } from './services/build-token.service';
import { BuildSessionGuard } from './guards/build-session.guard';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { BuildSessionsDataModule } from '../build-sessions-data/build-sessions-data.module';

@Module({
  imports: [EvaluationsModule, BuildSessionsDataModule],
  controllers: [StartBuildController, BuildController],
  providers: [BuildSessionsService, BuildTokenService, BuildSessionGuard],
  exports: [BuildSessionsService, BuildSessionsDataModule],
})
export class BuildSessionsModule {}
