import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { EvaluationsModule } from '../evaluations/evaluations.module';
import { SessionReadModule } from '../session-read/session-read.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { AuthModule } from '../auth/auth.module';
import { MentorController } from './handlers/mentor.controller';
import { MentorService } from './services/mentor.service';
import { MentorAgent } from './agents/mentor.agent';
import { MentorRepository } from './repositories/mentor.repository';

@Module({
  imports: [
    LlmModule,
    EvaluationsModule,
    SessionReadModule,
    SnapshotsModule,
    AuthModule,
  ],
  controllers: [MentorController],
  providers: [MentorService, MentorAgent, MentorRepository],
  exports: [MentorService],
})
export class MentorModule {}
