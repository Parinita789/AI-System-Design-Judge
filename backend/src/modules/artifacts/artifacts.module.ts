import { Module } from '@nestjs/common';
import { ArtifactsService } from './services/artifacts.service';
import { ProjectFilesService } from './services/project-files.service';
import { ClaudeJsonlService } from './services/claude-jsonl.service';
import { GitLogService } from './services/git-log.service';
import { ArtifactsRepository } from './repositories/artifacts.repository';

@Module({
  providers: [
    ArtifactsService,
    ProjectFilesService,
    ClaudeJsonlService,
    GitLogService,
    ArtifactsRepository,
  ],
  exports: [ArtifactsService, ArtifactsRepository],
})
export class ArtifactsModule {}
