import { Injectable } from '@nestjs/common';

@Injectable()
export class ProjectFilesService {
  readPlanMd(_projectPath: string): Promise<string | null> {
    throw new Error('Not implemented');
  }

  readCodeFiles(_projectPath: string): Promise<Record<string, string>> {
    throw new Error('Not implemented');
  }
}
