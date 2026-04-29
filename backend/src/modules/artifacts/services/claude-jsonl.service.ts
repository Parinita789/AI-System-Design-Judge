import { Injectable } from '@nestjs/common';
import { JsonlEntry } from '../models/artifacts.types';

@Injectable()
export class ClaudeJsonlService {
  resolveJsonlPath(_projectPath: string): string | null {
    throw new Error('Not implemented');
  }

  readEntriesSinceOffset(_projectPath: string, _offset: number): Promise<{
    entries: JsonlEntry[];
    newOffset: number;
  }> {
    throw new Error('Not implemented');
  }

  readAllEntries(_projectPath: string): Promise<JsonlEntry[]> {
    throw new Error('Not implemented');
  }
}
