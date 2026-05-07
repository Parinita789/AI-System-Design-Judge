import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IncomingBuildEvent } from '../types/build-event.types';

@Injectable()
export class BuildEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Atomic batch insert + counter increment on the parent session.
  // Returns the number of rows actually written so the caller can
  // ack precisely back to the CLI.
  async insertBatch(sessionId: string, events: IncomingBuildEvent[]): Promise<number> {
    if (events.length === 0) return 0;
    const rows = events.map((e) => ({
      sessionId,
      filePath: e.filePath,
      action: e.action,
      content: e.content ?? null,
      contentDiff: e.contentDiff ?? null,
      occurredAt: new Date(e.occurredAt),
    }));
    const [created] = await this.prisma.$transaction([
      this.prisma.buildEvent.createMany({ data: rows }),
      this.prisma.session.update({
        where: { id: sessionId },
        data: { buildEventCount: { increment: events.length } },
      }),
    ]);
    return created.count;
  }

  countForSession(sessionId: string) {
    return this.prisma.buildEvent.count({ where: { sessionId } });
  }
}
