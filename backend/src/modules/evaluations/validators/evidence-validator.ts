import { SignalResult } from '../types/evaluation.types';

// Catches the "LLM cited a quote that isn't in plan.md" hallucination
// mode by ground-checking each HIT/PARTIAL signal's evidence against
// plan.md + hint history. Ungrounded signals are downgraded one notch
// and annotated, so the failure is visible numerically and textually.

export interface EvidenceValidationResult {
  signals: Record<string, SignalResult>;
  downgraded: string[];
}

export function validateEvidence(
  signals: Record<string, SignalResult>,
  planMd: string | null,
  hints: Array<{ prompt: string; response: string }>,
): EvidenceValidationResult {
  const corpus = buildCorpus(planMd, hints);
  const downgraded: string[] = [];
  const out: Record<string, SignalResult> = {};

  for (const [id, sig] of Object.entries(signals)) {
    out[id] = sig;
    if (sig.result !== 'hit' && sig.result !== 'partial') continue;
    if (!sig.evidence || sig.evidence.length < 20) continue;
    if (isGrounded(sig.evidence, corpus)) continue;

    const next: SignalResult['result'] = sig.result === 'hit' ? 'partial' : 'miss';
    out[id] = {
      result: next,
      evidence:
        `${sig.evidence} ` +
        `[unverifiable: quoted text not found in plan.md or hint history; ` +
        `auto-downgraded ${sig.result} → ${next}]`,
    };
    downgraded.push(id);
  }

  return { signals: out, downgraded };
}

function buildCorpus(
  planMd: string | null,
  hints: Array<{ prompt: string; response: string }>,
): string {
  const parts: string[] = [];
  if (planMd) parts.push(planMd);
  for (const h of hints) {
    if (h.prompt) parts.push(h.prompt);
    if (h.response) parts.push(h.response);
  }
  return normalize(parts.join('\n\n'));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isGrounded(evidence: string, corpus: string): boolean {
  const evidenceNorm = normalize(evidence);
  if (!evidenceNorm) return true;

  const WINDOW = 30;
  const STRIDE = 10;
  if (evidenceNorm.length >= WINDOW) {
    for (let i = 0; i + WINDOW <= evidenceNorm.length; i += STRIDE) {
      if (corpus.includes(evidenceNorm.slice(i, i + WINDOW))) return true;
    }
  }

  const words = evidenceNorm.split(' ').filter((w) => w.length > 2);
  // Too few content words to validate without false positives.
  if (words.length < 5) return true;
  for (let i = 0; i + 5 <= words.length; i++) {
    const gram = words.slice(i, i + 5).join(' ');
    if (corpus.includes(gram)) return true;
  }

  return false;
}
