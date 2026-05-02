import { Injectable } from '@nestjs/common';
import { JsonlEntry } from '../../artifacts/types/artifacts.types';
import { Phase, TaggedEntries } from '../types/phase.types';

@Injectable()
export class PhaseTaggerService {
  tag(_entries: JsonlEntry[]): TaggedEntries {
    throw new Error('Not implemented');
  }

  inferPhaseAt(_elapsedMinutes: number, _recentActivity: unknown): Phase | null {
    throw new Error('Not implemented');
  }
}
