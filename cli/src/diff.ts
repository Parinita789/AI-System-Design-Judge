import { createPatch } from 'diff';

const RE_BASELINE_AGE_MS = 24 * 60 * 60 * 1000;
const RE_BASELINE_DIFF_BYTES = 50_000;

export interface PrevState {
  content: string;
  capturedAt: number;
}

export interface DiffOutcome {
  action: 'created' | 'modified';
  content: string | null;
  contentDiff: string | null;
}

// True when the file was touched but content is unchanged. Such an
// event has no information for the backend; the watcher should drop it
// rather than ship a phantom "modified" with no payload.
export function isNoopOutcome(o: DiffOutcome): boolean {
  return o.action === 'modified' && o.contentDiff === '' && o.content === null;
}

export function isLikelyBinary(content: string): boolean {
  // Heuristic: real binary files often contain NULs in the first 4KB.
  const slice = content.slice(0, 4096);
  return slice.indexOf('\0') !== -1;
}

export function shouldRebaseline(
  prev: PrevState,
  nextContent: string,
  diffSize: number,
  now = Date.now(),
): boolean {
  if (now - prev.capturedAt > RE_BASELINE_AGE_MS) return true;
  if (diffSize > RE_BASELINE_DIFF_BYTES) return true;
  if (isLikelyBinary(nextContent) || isLikelyBinary(prev.content)) return true;
  return false;
}

export function computeChange(
  filePath: string,
  prev: PrevState | null,
  nextContent: string,
  now = Date.now(),
): DiffOutcome {
  if (!prev) {
    if (isLikelyBinary(nextContent)) {
      return {
        action: 'created',
        content: `<binary, ${nextContent.length} bytes>`,
        contentDiff: null,
      };
    }
    return { action: 'created', content: nextContent, contentDiff: null };
  }

  if (prev.content === nextContent) {
    return { action: 'modified', content: null, contentDiff: '' };
  }

  const patch = createPatch(filePath, prev.content, nextContent, '', '', { context: 3 });
  if (shouldRebaseline(prev, nextContent, patch.length, now)) {
    return {
      action: 'modified',
      content: isLikelyBinary(nextContent) ? `<binary, ${nextContent.length} bytes>` : nextContent,
      contentDiff: null,
    };
  }
  return { action: 'modified', content: null, contentDiff: patch };
}
