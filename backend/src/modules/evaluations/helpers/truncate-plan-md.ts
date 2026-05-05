// Hard-cap on plan.md size in the LLM user payload.
//
// Without this, a verbose candidate (50K+ chars of code dumps, notes,
// scratch work in plan.md) silently fills the context window. On 1M
// context that's tolerable; on 200K-context models it overflows. Cap +
// middle-omission marker keeps the head and tail visible while
// signaling that something was dropped.
//
// Default cap chosen so that plan.md alone takes ~12K tokens (cap /
// ~3.5 chars per token), well under any reasonable model budget when
// combined with the rubric (~10K chars), question, signals, hints,
// and the user message scaffolding.

export const DEFAULT_PLAN_MD_CAP = 50_000;

export interface TruncationResult {
  text: string;
  originalLength: number;
  droppedChars: number;
}

export function truncatePlanMd(
  input: string | null,
  cap: number = DEFAULT_PLAN_MD_CAP,
): TruncationResult {
  if (input === null) {
    return { text: '', originalLength: 0, droppedChars: 0 };
  }
  if (input.length <= cap) {
    return { text: input, originalLength: input.length, droppedChars: 0 };
  }

  // 60% head / 40% tail favors the framing of the plan (intro, scope,
  // NFRs typically come first) while keeping the conclusion (validation,
  // tradeoffs, build sequence) visible.
  const dropped = input.length - cap;
  const marker = `\n\n[… ${dropped.toLocaleString()} chars omitted …]\n\n`;
  const room = cap - marker.length;
  const headLen = Math.max(0, Math.floor(room * 0.6));
  const tailLen = Math.max(0, room - headLen);

  const text = input.slice(0, headLen) + marker + input.slice(input.length - tailLen);
  return {
    text,
    originalLength: input.length,
    droppedChars: dropped,
  };
}
