import { Global, Module } from '@nestjs/common';
import { BackgroundTaskTracker } from './background-task-tracker.service';

// @Global so call sites in any module can inject BackgroundTaskTracker
// without re-importing CommonModule. The tracker is a singleton — one
// pool of in-flight tasks across the whole app — so global is the
// right scope.
@Global()
@Module({
  providers: [BackgroundTaskTracker],
  exports: [BackgroundTaskTracker],
})
export class CommonModule {}
