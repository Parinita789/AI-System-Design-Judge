import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { prompt: string; rubricVersion: string }) {
    return this.prisma.question.create({ data });
  }

  // List for the sidebar — newest first. Per-session phase evaluations are
  // ordered newest-first so consumers (sidebar best-score, results page
  // attempt list) can use phaseEvaluations[0] / find(phase==='plan') and
  // get the latest evaluation when multiple exist.
  findAll() {
    return this.prisma.question.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          include: { phaseEvaluations: { orderBy: { evaluatedAt: 'desc' } } },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
  }

  findById(id: string) {
    return this.prisma.question.findUnique({
      where: { id },
      include: {
        sessions: {
          include: { phaseEvaluations: { orderBy: { evaluatedAt: 'desc' } } },
          orderBy: { startedAt: 'asc' },
        },
      },
    });
  }
}
