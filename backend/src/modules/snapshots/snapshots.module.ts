import { Module } from '@nestjs/common';
import { SnapshotsController } from './handlers/snapshots.controller';
import { SnapshotsService } from './services/snapshots.service';
import { SnapshotsRepository } from './repositories/snapshots.repository';

@Module({
  controllers: [SnapshotsController],
  providers: [SnapshotsService, SnapshotsRepository],
  exports: [SnapshotsService, SnapshotsRepository],
})
export class SnapshotsModule {}
