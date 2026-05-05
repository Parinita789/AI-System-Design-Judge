import { Module, forwardRef } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { SessionsModule } from '../sessions/sessions.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { MentorController } from './handlers/mentor.controller';
import { MentorService } from './services/mentor.service';
import { MentorAgent } from './agents/mentor.agent';
import { MentorRepository } from './repositories/mentor.repository';

@Module({
  imports: [
    LlmModule,
    forwardRef(() => EvaluationsModule),
    forwardRef(() => SessionsModule),
    SnapshotsModule,
  ],
  controllers: [MentorController],
  providers: [MentorService, MentorAgent, MentorRepository],
  exports: [MentorService],
})
export class MentorModule {}
