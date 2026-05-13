import * as path from 'node:path';

// Resolve segments under a base directory, then assert the result
// stays inside that base. Throws PathTraversalError when the
// resolved path escapes — defending against `..`, absolute-path
// segments, and trailing-slash edge cases.
//
// Use this at every site that builds a filesystem path from
// caller-supplied (URL params, DB ids) input before calling
// fs.read/write/rm/etc.

export class PathTraversalError extends Error {
  constructor(
    public readonly base: string,
    public readonly attempted: string,
  ) {
    super(`Refusing path outside base: base=${base} attempted=${attempted}`);
    this.name = 'PathTraversalError';
  }
}

export function safeJoinUnderBase(base: string, ...segments: string[]): string {
  const baseResolved = path.resolve(base);
  const joined = path.resolve(baseResolved, ...segments);
  if (joined !== baseResolved && !joined.startsWith(baseResolved + path.sep)) {
    throw new PathTraversalError(baseResolved, joined);
  }
  return joined;
}

// Convenience: returns true if `candidate` resolves inside `base`,
// without throwing. Useful for callers that prefer a no-op +
// warning over an exception (e.g. cleanup paths).
export function isUnderBase(base: string, ...segments: string[]): boolean {
  try {
    safeJoinUnderBase(base, ...segments);
    return true;
  } catch (err) {
    if (err instanceof PathTraversalError) return false;
    throw err;
  }
}
