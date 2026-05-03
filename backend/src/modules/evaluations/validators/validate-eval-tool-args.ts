import { SignalResult } from '../types/evaluation.types';
import { EvaluationParseError, ParsedEvalOutput } from './parse-eval-output';

const VALID_RESULTS = new Set(['hit', 'miss', 'partial', 'cannot_evaluate']);

export function validateEvalToolArgs(
  rawArgs: unknown,
  expectedSignalIds: ReadonlySet<string>,
): ParsedEvalOutput {
  const rawText = safeStringify(rawArgs);

  if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
    throw new EvaluationParseError('Tool args were not a JSON object', rawText);
  }
  const obj = rawArgs as Record<string, unknown>;

  if (!obj.signals || typeof obj.signals !== 'object' || Array.isArray(obj.signals)) {
    throw new EvaluationParseError('Tool args missing or invalid "signals" object', rawText);
  }

  const signals: Record<string, SignalResult> = {};
  for (const [signalId, val] of Object.entries(obj.signals as Record<string, unknown>)) {
    if (!expectedSignalIds.has(signalId)) {
      throw new EvaluationParseError(
        `Unknown signal id "${signalId}" not in rubric`,
        rawText,
      );
    }
    if (!val || typeof val !== 'object') {
      throw new EvaluationParseError(`Signal "${signalId}" is not an object`, rawText);
    }
    const v = val as Record<string, unknown>;
    if (typeof v.result !== 'string' || !VALID_RESULTS.has(v.result)) {
      throw new EvaluationParseError(
        `Signal "${signalId}".result must be one of ${[...VALID_RESULTS].join('|')}`,
        rawText,
      );
    }
    if (typeof v.evidence !== 'string') {
      throw new EvaluationParseError(`Signal "${signalId}".evidence must be a string`, rawText);
    }
    if (v.reasoning !== undefined && typeof v.reasoning !== 'string') {
      throw new EvaluationParseError(`Signal "${signalId}".reasoning must be a string`, rawText);
    }
    signals[signalId] = {
      result: v.result as SignalResult['result'],
      evidence: v.evidence,
      ...(typeof v.reasoning === 'string' ? { reasoning: v.reasoning } : {}),
    };
  }

  for (const id of expectedSignalIds) {
    if (!(id in signals)) {
      throw new EvaluationParseError(`Missing signal "${id}" in tool args`, rawText);
    }
  }

  if (typeof obj.feedback !== 'string') {
    throw new EvaluationParseError('Tool args missing or non-string "feedback"', rawText);
  }

  const topActionsRaw = (obj.top_actions ?? obj.topActions) as unknown;
  if (!Array.isArray(topActionsRaw)) {
    throw new EvaluationParseError('Tool args missing or non-array "top_actions"', rawText);
  }
  const topActions: string[] = [];
  for (const item of topActionsRaw) {
    if (typeof item !== 'string') {
      throw new EvaluationParseError('"top_actions" must contain only strings', rawText);
    }
    topActions.push(item);
  }

  return { score: 0, signals, feedback: obj.feedback, topActions };
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
