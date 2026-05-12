import * as crypto from 'node:crypto';

// Stable id for an issue: hashes the file path, the axis, and a
// normalized form of the fingerprint. Wording drift in the issue
// text doesn't change the id; only the file/axis/fingerprint do.
//
// Why fingerprint and not the issue text: the LLM rephrases the
// same defect across runs. The rubric instructs it to keep the
// fingerprint stable; we hash that.
export function computeIssueId(file: string, axis: string, fingerprint: string): string {
  const normalized = normalizeFingerprint(fingerprint);
  const seed = `${file}::${axis}::${normalized}`;
  return crypto.createHash('sha1').update(seed).digest('hex');
}

export function normalizeFingerprint(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}
