import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { Phase } from '../../phase-tagger/models/phase.types';
import { PhaseEvaluationResult } from '../models/evaluation.types';

@Injectable()
export class EvaluationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertPhaseEvaluation(sessionId: string, phase: Phase, result: PhaseEvaluationResult) {
    const data = {
      score: result.score,
      signalResults: result.signalResults as unknown as Prisma.InputJsonValue,
      feedbackText: result.feedbackText,
      topActionableItems: result.topActionableItems as unknown as Prisma.InputJsonValue,
    };
    return this.prisma.phaseEvaluation.upsert({
      where: { sessionId_phase: { sessionId, phase } },
      create: { sessionId, phase, ...data },
      update: { ...data, evaluatedAt: new Date() },
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
