import { Phase } from '../../modules/phase-tagger/types/phase.types';

export class EvaluationCompletedEvent {
  static readonly eventName = 'evaluation.completed';

  constructor(
    public readonly evaluationId: string,
    public readonly sessionId: string,
    public readonly phase: Phase,
    public readonly model?: string,
  ) {}
}

export class BuildEvalRequestedEvent {
  static readonly eventName = 'build-eval.requested';

  constructor(public readonly sessionId: string) {}
}
