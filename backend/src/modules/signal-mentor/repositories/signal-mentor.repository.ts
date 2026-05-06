import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { SignalMentorArtifact, SignalMentorResult } from '../types/signal-mentor.types';

@Injectable()
export class SignalMentorRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertByEvaluationId(phaseEvaluationId: string, result: SignalMentorResult) {
    const data = {
      annotations: result.artifact.annotations as unknown as Prisma.InputJsonValue,
      modelUsed: result.audit.modelUsed,
      tokensIn: result.audit.tokensIn,
      tokensOut: result.audit.tokensOut,
      cacheReadTokens: result.audit.cacheReadTokens,
      cacheCreationTokens: result.audit.cacheCreationTokens,
      latencyMs: result.audit.latencyMs,
    };

    return this.prisma.signalMentorArtifact.upsert({
      where: { phaseEvaluationId },
      create: { phaseEvaluationId, ...data },
      update: data,
    });
  }

  findByEvaluationId(phaseEvaluationId: string) {
    return this.prisma.signalMentorArtifact.findUnique({
      where: { phaseEvaluationId },
    });
  }

  static toApiShape(
    row: Awaited<ReturnType<SignalMentorRepository['findByEvaluationId']>>,
  ) {
    if (!row) return null;
    const artifact: SignalMentorArtifact = {
      annotations: (row.annotations as unknown as Record<string, string>) ?? {},
    };
    return {
      id: row.id,
      phaseEvaluationId: row.phaseEvaluationId,
      artifact,
      audit: {
        modelUsed: row.modelUsed,
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        cacheReadTokens: row.cacheReadTokens,
        cacheCreationTokens: row.cacheCreationTokens,
        latencyMs: row.latencyMs,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
