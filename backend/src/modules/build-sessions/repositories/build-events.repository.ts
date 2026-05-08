import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { IncomingBuildEvent } from '../types/build-event.types';

@Injectable()
export class BuildEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

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

  findAllForSession(sessionId: string) {
    return this.prisma.buildEvent.findMany({
      where: { sessionId },
      orderBy: { occurredAt: 'asc' },
      select: {
        filePath: true,
        action: true,
        content: true,
        contentDiff: true,
        occurredAt: true,
      },
    });
  }

  async summaryForSession(sessionId: string) {
    const grouped = await this.prisma.buildEvent.groupBy({
      by: ['filePath'],
      where: { sessionId },
      _count: { _all: true },
      _min: { occurredAt: true },
      _max: { occurredAt: true },
    });
    return grouped
      .map((g) => ({
        filePath: g.filePath,
        eventCount: g._count._all,
        firstAt: g._min.occurredAt,
        lastAt: g._max.occurredAt,
      }))
      .sort((a, b) => {
        const da = a.firstAt?.getTime() ?? 0;
        const db = b.firstAt?.getTime() ?? 0;
        return da - db;
      });
  }
}
