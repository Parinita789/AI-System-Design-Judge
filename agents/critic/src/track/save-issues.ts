import * as fs from 'node:fs';
import { IssuesIndex } from '../types';
import { issuesIndexPath } from './load-issues';

// Atomic write: write to a tmp file in the same dir, then rename.
// Same-dir rename is atomic on POSIX filesystems, so a reader
// either sees the old file or the new file, never a partial.
export function saveIssuesIndex(outputDir: string, index: IssuesIndex): void {
  const p = issuesIndexPath(outputDir);
  fs.mkdirSync(outputDir, { recursive: true });
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}
