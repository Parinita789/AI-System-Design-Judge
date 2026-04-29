import { Injectable } from '@nestjs/common';
import { SnapshotsRepository } from '../repositories/snapshots.repository';
import { ArtifactsService } from '../../artifacts/services/artifacts.service';
import { CaptureSnapshotDto } from '../models/capture-snapshot.dto';

@Injectable()
export class SnapshotsService {
  constructor(
    private readonly snapshotsRepository: SnapshotsRepository,
    private readonly artifactsService: ArtifactsService,
  ) {}

  capture(_sessionId: string, _dto: CaptureSnapshotDto) {
    throw new Error('Not implemented');
  }

  list(_sessionId: string) {
    throw new Error('Not implemented');
  }
}
