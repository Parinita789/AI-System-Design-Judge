import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOwnsSession(sessionId: string, userId: string): Promise<void> {
    const row = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException(`Session ${sessionId} not found`);
    if (row.userId !== userId) {
      throw new ForbiddenException(`Session ${sessionId} is not owned by the current user`);
    }
  }

  async assertOwnsQuestion(questionId: string, userId: string): Promise<void> {
    const row = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { userId: true },
    });
    if (!row) throw new NotFoundException(`Question ${questionId} not found`);
    if (row.userId !== userId) {
      throw new ForbiddenException(`Question ${questionId} is not owned by the current user`);
    }
  }

  // Evaluations live under a session; ownership flows through the join.
  // One query with a select on the relation avoids two round-trips.
  async assertOwnsEvaluation(evaluationId: string, userId: string): Promise<void> {
    const row = await this.prisma.phaseEvaluation.findUnique({
      where: { id: evaluationId },
      select: { session: { select: { userId: true } } },
    });
    if (!row) throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    if (row.session.userId !== userId) {
      throw new ForbiddenException(
        `Evaluation ${evaluationId} is not owned by the current user`,
      );
    }
  }
}
