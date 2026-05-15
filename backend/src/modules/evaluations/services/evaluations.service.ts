import { Injectable, NotFoundException } from '@nestjs/common';
import { Phase } from '../../phase-tagger/types/phase.types';
import { OrchestratorService } from './orchestrator.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';
import { SessionReadService } from '../../session-read/services/session-read.service';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly evalsRepo: EvaluationsRepository,
    private readonly sessionReadService: SessionReadService,
  ) {}

  async runForSession(sessionId: string, model?: string) {
    const session = await this.sessionReadService.getWithQuestion(sessionId);
    const phases: Phase[] = ['plan'];
    if (session.buildEndedAt) phases.push('build');
    return this.orchestrator.run(sessionId, phases, { model });
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
