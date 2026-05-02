import { JsonlEntry } from '../../artifacts/types/artifacts.types';

export type Phase = 'plan' | 'build' | 'validate' | 'wrap';

export type TaggedEntries = Record<Phase, JsonlEntry[]>;
