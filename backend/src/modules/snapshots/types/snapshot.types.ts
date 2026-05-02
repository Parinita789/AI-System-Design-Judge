export interface SnapshotArtifacts {
  planMd: string | null;
  codeFiles: Record<string, string>;
  gitLog: string | null;
  newJsonlEntries: unknown[];
}
