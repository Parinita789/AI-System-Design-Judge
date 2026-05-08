import { Global, Module } from '@nestjs/common';
import { BackgroundTaskTracker } from './background-task-tracker.service';

@Global()
@Module({
  providers: [BackgroundTaskTracker],
  exports: [BackgroundTaskTracker],
})
export class CommonModule {}
