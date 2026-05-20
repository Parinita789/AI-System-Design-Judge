import { Module } from '@nestjs/common';
import { QuestionsController } from './handlers/questions.controller';
import { QuestionsService } from './services/questions.service';
import { QuestionsRepository } from './repositories/questions.repository';
import { SessionsModule } from '../sessions/sessions.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [SessionsModule, SnapshotsModule, GuardrailsModule, AuthModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionsRepository],
  exports: [QuestionsService],
})
export class QuestionsModule {}
