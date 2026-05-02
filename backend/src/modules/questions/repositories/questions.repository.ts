import { Injectable } from '@nestjs/common';
import { Mode as PrismaMode } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class QuestionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: { prompt: string; rubricVersion: string; mode: PrismaMode | null }) {
    return this.prisma.question.create({ data });
  }

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
