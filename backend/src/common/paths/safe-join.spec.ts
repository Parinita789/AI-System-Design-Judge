import { safeJoinUnderBase, isUnderBase, PathTraversalError } from './safe-join';

describe('safeJoinUnderBase', () => {
  it('joins a single safe segment', () => {
    expect(safeJoinUnderBase('/tmp/base', 'child')).toBe('/tmp/base/child');
  });

  it('joins multiple safe segments', () => {
    expect(safeJoinUnderBase('/tmp/base', 'a', 'b', 'c.txt')).toBe('/tmp/base/a/b/c.txt');
  });

  it('throws on .. escape attempts', () => {
    expect(() => safeJoinUnderBase('/tmp/base', '../etc/passwd')).toThrow(PathTraversalError);
  });

  it('throws when an absolute path is supplied as a segment', () => {
    expect(() => safeJoinUnderBase('/tmp/base', '/etc/passwd')).toThrow(PathTraversalError);
  });

  it('throws on multi-step .. escape attempts', () => {
    expect(() => safeJoinUnderBase('/tmp/base', '../../foo')).toThrow(PathTraversalError);
  });

  it('allows joining to exactly the base dir', () => {
    expect(safeJoinUnderBase('/tmp/base', '.')).toBe('/tmp/base');
  });

  it('refuses sibling-prefix collisions', () => {
    // /tmp/base-other/foo is NOT inside /tmp/base/, even though
    // its path string starts with /tmp/base. We use the
    // `base + path.sep` check to catch this.
    expect(() => safeJoinUnderBase('/tmp/base', '../base-other/foo')).toThrow(PathTraversalError);
  });
});

describe('isUnderBase', () => {
  it('returns true for safe paths', () => {
    expect(isUnderBase('/tmp/base', 'child')).toBe(true);
  });

  it('returns false for escape attempts', () => {
    expect(isUnderBase('/tmp/base', '../etc/passwd')).toBe(false);
  });
});
