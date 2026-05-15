import { Module } from '@nestjs/common';
import { BuildEventsRepository } from '../build-sessions/repositories/build-events.repository';
import { BuildAIInteractionsRepository } from '../build-sessions/repositories/build-ai-interactions.repository';

@Module({
  providers: [BuildEventsRepository, BuildAIInteractionsRepository],
  exports: [BuildEventsRepository, BuildAIInteractionsRepository],
})
export class BuildSessionsDataModule {}
