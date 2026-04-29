import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { EvaluationsRepository } from '../repositories/evaluations.repository';

@Injectable()
export class EvaluationsService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly evaluationsRepository: EvaluationsRepository,
  ) {}

  // Kicks off the async evaluation pipeline; returns the in-progress evaluation id.
  enqueueForSession(_sessionId: string): Promise<{ evaluationId: string }> {
    throw new Error('Not implemented');
  }

  getStatus(_evaluationId: string) {
    throw new Error('Not implemented');
  }

  getResult(_evaluationId: string) {
    throw new Error('Not implemented');
  }
}
