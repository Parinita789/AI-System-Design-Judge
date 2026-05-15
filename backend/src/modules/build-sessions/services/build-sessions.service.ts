import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../database/prisma.service';
import { BuildEventsRepository } from '../repositories/build-events.repository';
import { BuildAIInteractionsRepository } from '../repositories/build-ai-interactions.repository';
import { BuildTokenService, MintedToken } from './build-token.service';
import { IncomingBuildEvent } from '../types/build-event.types';
import { BuildAIInteractionDto } from '../dto/build-ai-interaction.dto';
import { EvaluationsRepository } from '../../evaluations/repositories/evaluations.repository';
import { BuildEvalRequestedEvent } from '../../../common/events/evaluation-events';

@Injectable()
export class BuildSessionsService {
  private readonly logger = new Logger(BuildSessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: BuildTokenService,
    private readonly events: BuildEventsRepository,
    private readonly aiInteractions: BuildAIInteractionsRepository,
    private readonly evalsRepo: EvaluationsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async startBuildPhase(sessionId: string): Promise<MintedToken> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        status: true,
        buildEndedAt: true,
        question: { select: { kind: true } },
      },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.status === 'abandoned') {
      throw new ConflictException(
        `Session ${sessionId} is abandoned; cannot start a build phase`,
      );
    }
    if (session.buildEndedAt) {
      throw new ConflictException(
        `Build phase for session ${sessionId} has already finished`,
      );
    }
    if (session.question.kind !== 'agentic_build') {
      throw new ConflictException(
        `Session ${sessionId} belongs to a "${session.question.kind}" question; ` +
          'only agentic_build questions have a build phase.',
      );
    }
    return this.tokens.mintForSession(sessionId);
  }

  insertEvents(sessionId: string, events: IncomingBuildEvent[]) {
    return this.events.insertBatch(sessionId, events);
  }

  insertAiInteractions(sessionId: string, interactions: BuildAIInteractionDto[]) {
    return this.aiInteractions.insertBatch(sessionId, interactions);
  }

  async eventsSummary(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        buildStartedAt: true,
        buildEndedAt: true,
        buildEventCount: true,
      },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    const [perFile, aiCounts] = await Promise.all([
      this.events.summaryForSession(sessionId),
      this.aiInteractions.countsForSession(sessionId),
    ]);
    return {
      buildStartedAt: session.buildStartedAt,
      buildEndedAt: session.buildEndedAt,
      eventCount: session.buildEventCount,
      perFile,
      aiInteractionCount: aiCounts.total,
      aiSessionsCount: aiCounts.distinctSessions,
    };
  }

  async finishBuildPhase(sessionId: string): Promise<{ ok: true; eventCount: number }> {
    // Atomic claim: only the row whose buildEndedAt is still null gets
    // stamped. Two concurrent finish calls used to both pass the
    // findUnique-then-update gate and dispatch the orchestrator twice;
    // a single conditional UPDATE in the WHERE clause closes that race.
    const claimed = await this.prisma.session.updateMany({
      where: { id: sessionId, buildEndedAt: null },
      data: { buildEndedAt: new Date() },
    });
    if (claimed.count === 1) {
      const fresh = await this.prisma.session.findUnique({
        where: { id: sessionId },
        select: { buildEventCount: true },
      });
      const eventCount = fresh?.buildEventCount ?? 0;
      this.logger.log(
        `Build phase finished for session ${sessionId} ` +
          `(${eventCount} events captured). ` +
          'Dispatching BuildAgent in the background.',
      );
      this.dispatchBuildEval(sessionId);
      return { ok: true, eventCount };
    }
    // count === 0: either the session does not exist or buildEndedAt was
    // already set (by a prior call or a concurrent winner).
    const existing = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { buildEventCount: true },
    });
    if (!existing) throw new NotFoundException(`Session ${sessionId} not found`);
    const evals = await this.evalsRepo.findBySession(sessionId);
    const hasBuildEval = evals.some((e) => e.phase === 'build');
    if (!hasBuildEval) {
      this.logger.warn(
        `Session ${sessionId} buildEndedAt is set but no build eval exists — ` +
          'redispatching orchestrator (likely a prior crash).',
      );
      this.dispatchBuildEval(sessionId);
    }
    return { ok: true, eventCount: existing.buildEventCount };
  }

  private dispatchBuildEval(sessionId: string): void {
    this.eventEmitter.emit(
      BuildEvalRequestedEvent.eventName,
      new BuildEvalRequestedEvent(sessionId),
    );
  }
}
