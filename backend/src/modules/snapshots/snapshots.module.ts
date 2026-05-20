import { Module } from '@nestjs/common';
import { SnapshotsController } from './handlers/snapshots.controller';
import { SnapshotsService } from './services/snapshots.service';
import { SnapshotsRepository } from './repositories/snapshots.repository';
import { GuardrailsModule } from '../guardrails/guardrails.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [GuardrailsModule, AuthModule],
  controllers: [SnapshotsController],
  providers: [SnapshotsService, SnapshotsRepository],
  exports: [SnapshotsService, SnapshotsRepository],
})
export class SnapshotsModule {}
