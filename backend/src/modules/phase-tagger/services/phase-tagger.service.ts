import { Injectable } from '@nestjs/common';
import { JsonlEntry } from '../../artifacts/models/artifacts.types';
import { Phase, TaggedEntries } from '../models/phase.types';

@Injectable()
export class PhaseTaggerService {
  // Artifact-based phase inference. Replaceable seam — see decisions.md §2.
  tag(_entries: JsonlEntry[]): TaggedEntries {
    throw new Error('Not implemented');
  }

  inferPhaseAt(_elapsedMinutes: number, _recentActivity: unknown): Phase | null {
    throw new Error('Not implemented');
  }
}
