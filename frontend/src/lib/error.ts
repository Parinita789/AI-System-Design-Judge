export function extractApiError(err: unknown): string {
  if (!err) return 'Unknown error';
  const e = err as {
    message?: string;
    code?: string;
    response?: { data?: { message?: unknown }; status?: number; statusText?: string };
  };

  const apiMsg = e.response?.data?.message;
  if (typeof apiMsg === 'string' && apiMsg.trim()) return apiMsg;
  if (Array.isArray(apiMsg) && apiMsg.length > 0) {
    return apiMsg.filter((m) => typeof m === 'string').join('; ');
  }

  if (e.message && e.message.trim()) return e.message;
  if (e.code) return e.code;
  if (e.response?.status) {
    const txt = e.response.statusText ? ` ${e.response.statusText}` : '';
    return `HTTP ${e.response.status}${txt}`;
  }
  const s = String(err);
  return s === '[object Object]' ? 'Unknown error' : s;
}

// ---------------------------------------------------------------------------
// Guardrail-specific error parsing
//
// The backend's GuardrailRejectedError ships a structured body so the
// frontend can render specifically rather than dump the raw message
// string. Body shape (HTTP 400):
//   { statusCode: 400, error: 'Bad Request',
//     code: 'TOO_LONG' | 'TOO_SHORT' | 'EMPTY_AFTER_TRIM' | 'NOT_A_STRING',
//     preset: 'plan' | 'hint' | 'question',
//     observedLength: number, limit: number | null,
//     message: string }
// ---------------------------------------------------------------------------

export type GuardrailRejectionCode =
  | 'NOT_A_STRING'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'EMPTY_AFTER_TRIM';

export type GuardrailPresetName = 'plan' | 'hint' | 'question';

export interface GuardrailRejectionInfo {
  code: GuardrailRejectionCode;
  preset: GuardrailPresetName;
  observedLength: number;
  limit: number | null;
  message: string;
}

const GUARDRAIL_CODES: ReadonlySet<string> = new Set([
  'NOT_A_STRING',
  'TOO_SHORT',
  'TOO_LONG',
  'EMPTY_AFTER_TRIM',
]);

const GUARDRAIL_PRESETS: ReadonlySet<string> = new Set(['plan', 'hint', 'question']);

// Returns the structured rejection info if the error is a guardrail
// 400 response, else null. Null lets callers fall back to
// extractApiError() without special-casing the negative.
export function extractGuardrailError(err: unknown): GuardrailRejectionInfo | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as { response?: { data?: unknown; status?: number } };
  if (e.response?.status !== 400) return null;
  const body = e.response.data;
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (
    typeof b.code !== 'string' ||
    !GUARDRAIL_CODES.has(b.code) ||
    typeof b.preset !== 'string' ||
    !GUARDRAIL_PRESETS.has(b.preset) ||
    typeof b.observedLength !== 'number' ||
    !(typeof b.limit === 'number' || b.limit === null) ||
    typeof b.message !== 'string'
  ) {
    return null;
  }
  return {
    code: b.code as GuardrailRejectionCode,
    preset: b.preset as GuardrailPresetName,
    observedLength: b.observedLength,
    limit: b.limit as number | null,
    message: b.message,
  };
}

// Render a frontend-facing message that fronts the numbers. Less
// verbose than the backend's humanMessage; safe to drop into a
// banner. Falls back to the backend `message` for codes we don't
// have specialized copy for.
export function formatGuardrailMessage(g: GuardrailRejectionInfo): string {
  const label = PRESET_LABELS[g.preset];
  switch (g.code) {
    case 'TOO_LONG':
      return `${label} too long: ${g.observedLength.toLocaleString()} / ${(g.limit ?? 0).toLocaleString()} chars.`;
    case 'TOO_SHORT':
      return `${label} too short: ${g.observedLength} / ${g.limit ?? 0} chars minimum.`;
    case 'EMPTY_AFTER_TRIM':
      return `${label} can't be empty.`;
    case 'NOT_A_STRING':
      return `${label} must be text.`;
    default:
      return g.message;
  }
}

const PRESET_LABELS: Record<GuardrailPresetName, string> = {
  plan: 'Plan',
  hint: 'Hint',
  question: 'Question',
};

// Convenience: most callers want "guardrail message if guardrail
// error, else generic error string." This handles the dispatch.
export function describeError(err: unknown): string {
  const guardrail = extractGuardrailError(err);
  if (guardrail) return formatGuardrailMessage(guardrail);
  return extractApiError(err);
}
