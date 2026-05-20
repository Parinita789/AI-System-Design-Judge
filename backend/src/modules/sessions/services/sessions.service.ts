import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhaseEvaluation, Session, SessionStatus } from '@prisma/client';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SessionsRepository } from '../repositories/sessions.repository';
import { EndSessionDto } from '../dto/end-session.dto';
import { EvaluationsService } from '../../evaluations/services/evaluations.service';
import { BackgroundTaskTracker } from '../../../common/background-task-tracker.service';
import { OwnershipService } from '../../auth/services/ownership.service';

export type RedactedSession = Omit<Session, 'buildTokenHash'>;

export interface EndSessionResult {
  session: RedactedSession;
  evaluations: PhaseEvaluation[];
  evalError: string | null;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly sessionsRepository: SessionsRepository,
    private readonly evaluationsService: EvaluationsService,
    private readonly config: ConfigService,
    private readonly tasks: BackgroundTaskTracker,
    private readonly ownership: OwnershipService,
  ) {}

  // Inline ownership check on read paths: one query for the full row,
  // compare userId after fetch. Halves the DB roundtrips vs. calling
  // ownership.assertOwnsSession + findById separately. The 404 vs 403
  // distinction is preserved.
  async get(sessionId: string, userId: string) {
    const session = await this.sessionsRepository.findById(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.userId !== userId) {
      throw new ForbiddenException(`Session ${sessionId} is not owned by the current user`);
    }
    return session;
  }

  async getWithQuestion(sessionId: string, userId: string) {
    const session = await this.sessionsRepository.findByIdWithQuestion(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.userId !== userId) {
      throw new ForbiddenException(`Session ${sessionId} is not owned by the current user`);
    }
    return session;
  }

  list(userId: string, pagination?: { take?: number; skip?: number }) {
    return this.sessionsRepository.findAll(userId, pagination);
  }

  async end(sessionId: string, userId: string, dto: EndSessionDto): Promise<EndSessionResult> {
    // Read-and-check, then write. Avoids a separate ownership.assertOwns
    // query — but we still need to verify the session exists + belongs
    // to this user before markEnded touches it.
    const existing = await this.sessionsRepository.findById(sessionId);
    if (!existing) throw new NotFoundException(`Session ${sessionId} not found`);
    if (existing.userId !== userId) {
      throw new ForbiddenException(`Session ${sessionId} is not owned by the current user`);
    }
    const status = dto.status ?? SessionStatus.completed;
    const ended = await this.sessionsRepository.markEnded(sessionId, status);

    if (status !== SessionStatus.completed) {
      return { session: ended, evaluations: [], evalError: null };
    }

    try {
      const evaluations = await this.evaluationsService.runForSession(sessionId);
      return { session: ended, evaluations, evalError: null };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`Evaluation failed for ${sessionId}: ${message}`);
      return { session: ended, evaluations: [], evalError: message };
    }
  }

  async deleteSession(sessionId: string, userId: string): Promise<{ ok: true }> {
    await this.ownership.assertOwnsSession(sessionId, userId);
    await this.sessionsRepository.deleteById(sessionId);
    this.logger.log(`Session ${sessionId} deleted (DB row + cascades). Scheduling disk cleanup.`);
    this.tasks.track(this.cleanupArtifacts(sessionId), `cleanupArtifacts(${sessionId})`);
    return { ok: true };
  }

  async cleanupArtifacts(sessionId: string): Promise<void> {
    // The method is `public`, so we can't rely on the findById guard
    // in deleteSession. Validate the id format here and assert each
    // resolved path is a real child of its base before rm. Without
    // these, a sessionId like '../../../etc' would escape the base
    // and fs.rm({ recursive: true, force: true }) would delete it.
    if (!UUID_REGEX.test(sessionId)) {
      this.logger.warn(`Refusing cleanupArtifacts for non-UUID sessionId: ${sessionId}`);
      return;
    }

    const bases = [
      this.config.get<string>('MENTOR_ARTIFACT_DIR') ?? './data/mentor-artifacts',
      this.config.get<string>('SIGNAL_MENTOR_ARTIFACT_DIR') ?? './data/signal-mentor-artifacts',
    ];
    for (const base of bases) {
      const baseResolved = path.resolve(base);
      const dir = path.resolve(baseResolved, sessionId);
      if (dir !== baseResolved && !dir.startsWith(baseResolved + path.sep)) {
        this.logger.warn(`Refusing to rm ${dir} — escapes base ${baseResolved}`);
        continue;
      }
      try {
        await fs.rm(dir, { recursive: true, force: true });
        this.logger.log(`Removed artifact dir ${dir}`);
      } catch (err) {
        this.logger.warn(
          `Failed to remove artifact dir ${dir}: ${(err as Error).message}`,
        );
      }
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
