import { Injectable, NotFoundException } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly evalsRepo: EvaluationsRepository,
  ) {}

  // Plan phase only; build/validate/wrap agents are stubs.
  runForSession(sessionId: string, model?: string) {
    return this.orchestrator.run(sessionId, ['plan'], { model });
  }

  getBySession(sessionId: string) {
    return this.evalsRepo.findBySession(sessionId);
  }

  async getById(evaluationId: string) {
    const row = await this.evalsRepo.findById(evaluationId);
    if (!row) throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    return row;
  }

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
