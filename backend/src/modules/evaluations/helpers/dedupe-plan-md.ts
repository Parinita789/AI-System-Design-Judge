// Strips paragraphs that exactly repeat an earlier paragraph (after
// trim + whitespace-collapse + lowercase normalization). Horizontal-rule
// markdown ("---", "***", "___") is preserved verbatim — repeating them
// is structural, not a duplication mistake.
//
// Used to pre-process the candidate's plan.md before it enters the LLM
// user payload. Saves input tokens when the candidate accidentally
// pasted a section twice or duplicated a heading + body block.

export interface DedupeResult {
  text: string;
  removedParagraphs: number;
  removedChars: number;
}

const HORIZONTAL_RULE = /^([-*_])\1{2,}$/;

export function dedupePlanMd(input: string | null): DedupeResult {
  if (!input) return { text: '', removedParagraphs: 0, removedChars: 0 };

  const paragraphs = input.split(/\n[ \t]*\n+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  let removedParagraphs = 0;
  let removedChars = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (trimmed.length === 0) continue;

    if (HORIZONTAL_RULE.test(trimmed)) {
      kept.push(para);
      continue;
    }

    const key = trimmed.replace(/\s+/g, ' ').toLowerCase();
    if (seen.has(key)) {
      removedParagraphs++;
      removedChars += para.length;
      continue;
    }
    seen.add(key);
    kept.push(para);
  }

  return {
    text: kept.join('\n\n'),
    removedParagraphs,
    removedChars,
  };
}
