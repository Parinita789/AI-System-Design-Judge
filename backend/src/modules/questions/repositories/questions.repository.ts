import { Injectable } from '@nestjs/common';
import { Mode as PrismaMode } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { prompt: string; rubricVersion: string; mode: PrismaMode | null }) {
    return this.prisma.question.create({ data });
  }

  async findAll() {
    const rows = await this.prisma.question.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          include: {
            phaseEvaluations: {
              orderBy: { evaluatedAt: 'desc' },
              include: { audit: { select: { modelUsed: true } } },
            },
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    return rows.map(flattenQuestion);
  }

  async findById(id: string) {
    const row = await this.prisma.question.findUnique({
      where: { id },
      include: {
        sessions: {
          include: {
            phaseEvaluations: {
              orderBy: { evaluatedAt: 'desc' },
              include: { audit: { select: { modelUsed: true } } },
            },
          },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
    return row ? flattenQuestion(row) : null;
  }
}

function flattenQuestion<
  T extends {
    sessions: Array<{
      phaseEvaluations: Array<{ audit: { modelUsed: string } | null } & Record<string, unknown>>;
    }>;
  },
>(question: T): T {
  return {
    ...question,
    sessions: question.sessions.map((s) => ({
      ...s,
      phaseEvaluations: s.phaseEvaluations.map(({ audit, ...rest }) => ({
        ...rest,
        modelUsed: audit?.modelUsed ?? null,
      })),
    })),
  } as T;
}
