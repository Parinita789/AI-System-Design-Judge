import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class SnapshotsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(_data: {
    sessionId: string;
    elapsedMinutes: number;
    inferredPhase: string | null;
    artifacts: unknown;
  }) {
    throw new Error('Not implemented');
  }

  findBySession(_sessionId: string) {
    throw new Error('Not implemented');
  }

  latestJsonlOffset(_sessionId: string): Promise<number> {
    throw new Error('Not implemented');
  }
}
