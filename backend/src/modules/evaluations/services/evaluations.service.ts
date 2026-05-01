import { Injectable, NotFoundException } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly evalsRepo: EvaluationsRepository,
  ) {}

  // Run the evaluator synchronously. Currently scoped to the plan phase only;
  // other phase agents are still stubbed.
  runForSession(sessionId: string) {
    return this.orchestrator.run(sessionId, ['plan']);
  }

  getBySession(sessionId: string) {
    return this.evalsRepo.findBySession(sessionId);
  }

  async getById(evaluationId: string) {
    const row = await this.evalsRepo.findById(evaluationId);
    if (!row) throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    return row;
  }

  // Returns the EvaluationAudit row for an evaluation: the rendered prompt
  // sent to the LLM, the raw response text before JSON parsing, and the
  // call's token / model metadata. 1:1 with PhaseEvaluation.
  async getAudit(evaluationId: string) {
    const row = await this.evalsRepo.findAuditByEvaluation(evaluationId);
    if (!row) {
      throw new NotFoundException(
        `No audit row for evaluation ${evaluationId} — it predates the audit-trail feature`,
      );
    }
    return row;
  }
}
