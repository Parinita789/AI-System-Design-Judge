import { Injectable } from '@nestjs/common';
import { ProjectFilesService } from './project-files.service';
import { ClaudeJsonlService } from './claude-jsonl.service';
import { GitLogService } from './git-log.service';
import { SnapshotArtifacts } from '../../snapshots/models/snapshot.types';
import { FinalArtifacts } from '../models/artifacts.types';

@Injectable()
export class ArtifactsService {
  constructor(
    private readonly files: ProjectFilesService,
    private readonly jsonl: ClaudeJsonlService,
    private readonly git: GitLogService,
  ) {}

  gatherSnapshot(_projectPath: string, _sinceJsonlOffset: number): Promise<SnapshotArtifacts> {
    throw new Error('Not implemented');
  }

  gatherFinal(_projectPath: string): Promise<FinalArtifacts> {
    throw new Error('Not implemented');
  }
}
