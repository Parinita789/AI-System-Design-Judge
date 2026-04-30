import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Each call inserts a new row. Multiple evaluations of the same
  // (sessionId, phase) are preserved as history (no @@unique constraint
  // any more). Use `findBySession` to read them newest-first.
  createPhaseEvaluation(sessionId: string, phase: Phase, result: PhaseEvaluationResult) {
    return this.prisma.phaseEvaluation.create({
      data: {
        sessionId,
        phase,
        score: result.score,
        signalResults: result.signalResults as unknown as Prisma.InputJsonValue,
        feedbackText: result.feedbackText,
        topActionableItems: result.topActionableItems as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findBySession(sessionId: string) {
    return this.prisma.phaseEvaluation.findMany({
      where: { sessionId },
      orderBy: { evaluatedAt: 'desc' },
    });
  }

  findById(evaluationId: string) {
    return this.prisma.phaseEvaluation.findUnique({ where: { id: evaluationId } });
  }
}
