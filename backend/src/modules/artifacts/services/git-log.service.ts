import { Injectable } from '@nestjs/common';

@Injectable()
export class GitLogService {
  read(_projectPath: string): Promise<string | null> {
    throw new Error('Not implemented');
  }
}
