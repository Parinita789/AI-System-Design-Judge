import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { MentorArtifact, MentorResult } from '../types/mentor.types';

@Injectable()
export class MentorRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Upsert by phaseEvaluationId — re-running mentor generation on the
  // same evaluation overwrites rather than appending. The unique
  // constraint on phase_evaluation_id keeps the 1:1 invariant.
  upsertByEvaluationId(phaseEvaluationId: string, result: MentorResult) {
    const data = {
      content: result.artifact.content,
      modelUsed: result.audit.modelUsed,
      tokensIn: result.audit.tokensIn,
      tokensOut: result.audit.tokensOut,
      cacheReadTokens: result.audit.cacheReadTokens,
      cacheCreationTokens: result.audit.cacheCreationTokens,
      latencyMs: result.audit.latencyMs,
    };

    return this.prisma.mentorArtifact.upsert({
      where: { phaseEvaluationId },
      create: { phaseEvaluationId, ...data },
      update: data,
    });
  }

  findByEvaluationId(phaseEvaluationId: string) {
    return this.prisma.mentorArtifact.findUnique({
      where: { phaseEvaluationId },
    });
  }

  static toApiShape(
    row: Awaited<ReturnType<MentorRepository['findByEvaluationId']>>,
  ) {
    if (!row) return null;
    const artifact: MentorArtifact = { content: row.content };
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
