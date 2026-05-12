import * as fs from 'node:fs';
import * as path from 'node:path';
import { IssuesIndex } from '../types';

export function issuesIndexPath(outputDir: string): string {
  return path.join(outputDir, 'issues.json');
}

export function loadIssuesIndex(outputDir: string): IssuesIndex {
  const p = issuesIndexPath(outputDir);
  if (!fs.existsSync(p)) {
    return { version: 1, runs: [], issues: [] };
  }
  const raw = fs.readFileSync(p, 'utf8');
  const parsed = JSON.parse(raw) as IssuesIndex;
  if (parsed.version !== 1) {
    throw new Error(
      `issues.json has unsupported version ${parsed.version}. Delete it to start fresh.`,
    );
  }
  return parsed;
}
