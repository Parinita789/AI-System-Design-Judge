
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
