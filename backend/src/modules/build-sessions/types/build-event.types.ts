export type BuildEventAction = 'created' | 'modified' | 'deleted';

export interface IncomingBuildEvent {
  filePath: string;
  action: BuildEventAction;
  content?: string | null;
  contentDiff?: string | null;
  occurredAt: string;
  idempotencyKey?: string;
}
