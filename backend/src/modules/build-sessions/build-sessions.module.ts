import { Module } from '@nestjs/common';
import { StartBuildController } from './handlers/start-build.controller';
import { BuildController } from './handlers/build.controller';
import { BuildSessionsService } from './services/build-sessions.service';
import { BuildTokenService } from './services/build-token.service';
import { BuildSessionGuard } from './guards/build-session.guard';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { BuildSessionsDataModule } from '../build-sessions-data/build-sessions-data.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [EvaluationsModule, BuildSessionsDataModule, AuthModule],
  controllers: [StartBuildController, BuildController],
  providers: [BuildSessionsService, BuildTokenService, BuildSessionGuard],
  exports: [BuildSessionsService, BuildSessionsDataModule],
})
export class BuildSessionsModule {}
