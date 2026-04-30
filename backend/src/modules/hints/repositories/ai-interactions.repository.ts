import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class AIInteractionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySession(sessionId: string) {
    return this.prisma.aIInteraction.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
    });
  }

  create(data: {
    sessionId: string;
    occurredAt: Date;
    elapsedMinutes: number;
    inferredPhase: string | null;
    prompt: string;
    response: string;
    modelUsed: string;
    tokensIn: number;
    tokensOut: number;
    artifactStateAtPrompt: Prisma.InputJsonValue;
  }) {
    return this.prisma.aIInteraction.create({ data });
  }
}
