import { applyPatch } from 'diff';
import { createHash } from 'node:crypto';

export interface BuildEventForTree {
  filePath: string;
  action: string;
  content: string | null;
  contentDiff: string | null;
  occurredAt: Date;
}

export interface FinalTreeEntry {
  path: string;
  size: number;
  sha1: string;
}

export interface ReconstructedTree {
  tree: FinalTreeEntry[];
  contents: Map<string, string>;
  brokenPatchPaths: string[];
}

export function reconstructBuildTree(events: BuildEventForTree[]): ReconstructedTree {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const contents = new Map<string, string>();
  const brokenPatchPaths = new Set<string>();

  for (const e of ordered) {
    if (e.action === 'deleted') {
      contents.delete(e.filePath);
      continue;
    }
    if (e.content !== null) {
      contents.set(e.filePath, e.content);
      continue;
    }
    if (e.contentDiff && e.contentDiff.length > 0) {
      const prior = contents.get(e.filePath);
      if (prior === undefined) {
        brokenPatchPaths.add(e.filePath);
        continue;
      }
      let patched: string | false;
      try {
        patched = applyPatch(prior, e.contentDiff);
      } catch {
        patched = false;
      }
      if (patched === false) {
        brokenPatchPaths.add(e.filePath);
        continue;
      }
      contents.set(e.filePath, patched);
    }
  }

  const tree: FinalTreeEntry[] = [];
  for (const [path, content] of contents) {
    const size = Buffer.byteLength(content, 'utf-8');
    const sha1 = createHash('sha1').update(content).digest('hex');
    tree.push({ path, size, sha1 });
  }
  tree.sort((a, b) => a.path.localeCompare(b.path));

  return { tree, contents, brokenPatchPaths: [...brokenPatchPaths] };
}
