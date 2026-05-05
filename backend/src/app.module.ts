import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { SnapshotsModule } from './modules/snapshots/snapshots.module';
import { ArtifactsModule } from './modules/artifacts/artifacts.module';
import { EvaluationsModule } from './modules/evaluations/evaluations.module';
import { LlmModule } from './modules/llm/llm.module';
import { PhaseTaggerModule } from './modules/phase-tagger/phase-tagger.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HintsModule } from './modules/hints/hints.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { MentorModule } from './modules/mentor/mentor.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LlmModule,
    ArtifactsModule,
    PhaseTaggerModule,
    SnapshotsModule,
    EvaluationsModule,
    SessionsModule,
    QuestionsModule,
    DashboardModule,
    HintsModule,
    MentorModule,
  ],
})
export class AppModule {}
