import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhaseEvaluation, Session, SessionStatus } from '@prisma/client';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { SessionsRepository } from '../repositories/sessions.repository';
import { EndSessionDto } from '../dto/end-session.dto';
import { EvaluationsService } from '../../evaluations/services/evaluations.service';

// buildTokenHash is intentionally stripped at the repository — it
// must never reach the API. The service surfaces the redacted shape.
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
    @Inject(forwardRef(() => EvaluationsService))
    private readonly evaluationsService: EvaluationsService,
    private readonly config: ConfigService,
  ) {}

  async get(sessionId: string) {
    const session = await this.sessionsRepository.findById(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session;
  }

  async getWithQuestion(sessionId: string) {
    const session = await this.sessionsRepository.findByIdWithQuestion(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    return session;
  }

  list() {
    return this.sessionsRepository.findAll();
  }

  async end(sessionId: string, dto: EndSessionDto): Promise<EndSessionResult> {
    const existing = await this.sessionsRepository.findById(sessionId);
    if (!existing) throw new NotFoundException(`Session ${sessionId} not found`);
    const status = dto.status ?? SessionStatus.completed;
    const ended = await this.sessionsRepository.markEnded(sessionId, status);

    // Only auto-evaluate when the session completes naturally. Cancelled
    // (abandoned) sessions skip evaluation entirely.
    if (status !== SessionStatus.completed) {
      return { session: ended, evaluations: [], evalError: null };
    }

    try {
      const evaluations = await this.evaluationsService.runForSession(sessionId);
      return { session: ended, evaluations, evalError: null };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.error(`Evaluation failed for ${sessionId}: ${message}`);
      // Session stays `completed` — losing the evaluation shouldn't hold the
      // session hostage. Frontend will surface the error and offer a retry.
      return { session: ended, evaluations: [], evalError: message };
    }
  }

  // Hard delete. The DB row goes immediately; on-disk artifacts
  // (mentor + signal-mentor prompt/response files under MENTOR_ARTIFACT_DIR
  // and SIGNAL_MENTOR_ARTIFACT_DIR) are cleaned up fire-and-forget so
  // the API response stays snappy. A failed disk cleanup is logged but
  // not surfaced — the orphaned files are harmless and a periodic GC
  // pass would catch them.
  async deleteSession(sessionId: string): Promise<{ ok: true }> {
    const existing = await this.sessionsRepository.findById(sessionId);
    if (!existing) throw new NotFoundException(`Session ${sessionId} not found`);
    await this.sessionsRepository.deleteById(sessionId);
    this.logger.log(`Session ${sessionId} deleted (DB row + cascades). Scheduling disk cleanup.`);
    void this.cleanupArtifacts(sessionId);
    return { ok: true };
  }

  // Public so callers that delete sessions in bulk (e.g.,
  // QuestionsService.deleteQuestion) can fire the same async cleanup
  // for each child session without re-implementing the disk paths.
  async cleanupArtifacts(sessionId: string): Promise<void> {
    const dirs = [
      path.resolve(
        this.config.get<string>('MENTOR_ARTIFACT_DIR') ?? './data/mentor-artifacts',
        sessionId,
      ),
      path.resolve(
        this.config.get<string>('SIGNAL_MENTOR_ARTIFACT_DIR') ?? './data/signal-mentor-artifacts',
        sessionId,
      ),
    ];
    for (const dir of dirs) {
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
