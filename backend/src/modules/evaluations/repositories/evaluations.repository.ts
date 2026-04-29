import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertPhaseEvaluation(_sessionId: string, _phase: Phase, _result: PhaseEvaluationResult) {
    throw new Error('Not implemented');
  }

  findBySession(_sessionId: string) {
    throw new Error('Not implemented');
  }

  findById(_evaluationId: string) {
    throw new Error('Not implemented');
  }
}
