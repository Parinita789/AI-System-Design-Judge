import { Module, forwardRef } from '@nestjs/common';
import { HintsController } from './handlers/hints.controller';
import { HintsService } from './services/hints.service';
import { AIInteractionsRepository } from './repositories/ai-interactions.repository';
import { SessionsModule } from '../sessions/sessions.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [forwardRef(() => SessionsModule), SnapshotsModule, LlmModule],
  controllers: [HintsController],
  providers: [HintsService, AIInteractionsRepository],
  exports: [AIInteractionsRepository],
})
export class HintsModule {}
