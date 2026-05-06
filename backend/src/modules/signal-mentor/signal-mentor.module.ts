import { Module, forwardRef } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { SignalMentorController } from './handlers/signal-mentor.controller';
import { SignalMentorService } from './services/signal-mentor.service';
import { SignalMentorAgent } from './agents/signal-mentor.agent';
import { SignalMentorRepository } from './repositories/signal-mentor.repository';

@Module({
  imports: [
    LlmModule,
    forwardRef(() => EvaluationsModule),
    forwardRef(() => SessionsModule),
    SnapshotsModule,
  ],
  controllers: [SignalMentorController],
  providers: [SignalMentorService, SignalMentorAgent, SignalMentorRepository],
  exports: [SignalMentorService],
})
export class SignalMentorModule {}
