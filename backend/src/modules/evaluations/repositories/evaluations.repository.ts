import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { Phase } from '../../phase-tagger/models/phase.types';
import { EvaluationAuditPayload, PhaseEvaluationResult } from '../models/evaluation.types';

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

  // 1:1 with PhaseEvaluation. The unique constraint on
  // phase_evaluation_id enforces the "one audit per evaluation" invariant
  // — a re-evaluate creates a new PhaseEvaluation row, hence a new audit.
  createEvaluationAudit(phaseEvaluationId: string, audit: EvaluationAuditPayload) {
    return this.prisma.evaluationAudit.create({
      data: {
        phaseEvaluationId,
        prompt: audit.prompt,
        rawResponse: audit.rawResponse,
        modelUsed: audit.modelUsed,
        tokensIn: audit.tokensIn,
        tokensOut: audit.tokensOut,
        cacheReadTokens: audit.cacheReadTokens,
        cacheCreationTokens: audit.cacheCreationTokens,
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

  findAuditByEvaluation(phaseEvaluationId: string) {
    return this.prisma.evaluationAudit.findUnique({ where: { phaseEvaluationId } });
  }
}
