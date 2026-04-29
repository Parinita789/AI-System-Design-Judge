import { JsonlEntry } from '../../artifacts/models/artifacts.types';

export type Phase = 'plan' | 'build' | 'validate' | 'wrap';

export type TaggedEntries = Record<Phase, JsonlEntry[]>;
