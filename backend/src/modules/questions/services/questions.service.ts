import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Question, Session } from '@prisma/client';
import { QuestionsRepository } from '../repositories/questions.repository';
import { SessionsRepository } from '../../sessions/repositories/sessions.repository';
import { SessionsService } from '../../sessions/services/sessions.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { CreateQuestionDto } from '../dto/create-question.dto';
import { classifyMode } from '../../evaluations/helpers/mode-classifier';
import { Seniority as PrismaSeniority } from '@prisma/client';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private readonly questionsRepository: QuestionsRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly sessionsService: SessionsService,
    private readonly snapshotsService: SnapshotsService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateQuestionDto): Promise<{ question: Question; session: Session }> {
    const rubricVersion = this.config.get<string>('RUBRIC_VERSION') ?? 'v1.0';
    // v1.0 takes the legacy single-rubric path (no mode/seniority).
    const mode = rubricVersion === 'v1.0'
      ? null
      : (dto.mode ?? classifyMode(dto.prompt));
    const seniority: PrismaSeniority | null = rubricVersion === 'v1.0'
      ? null
      : (dto.seniority ?? 'senior');
    const question = await this.questionsRepository.create({
      prompt: dto.prompt,
      rubricVersion,
      mode,
    });
    const session = await this.sessionsRepository.create({
      questionId: question.id,
      seniority,
    });
    return { question, session };
  }

  list() {
    return this.questionsRepository.findAll();
  }

  async get(questionId: string) {
    const question = await this.questionsRepository.findById(questionId);
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);
    return question;
  }

  async startAttempt(questionId: string, seniorityOverride?: PrismaSeniority): Promise<Session> {
    const question = await this.get(questionId);

    let inheritedPlanMd: string | null = null;
    let mostRecent: Date | null = null;
    let inheritedSeniority: PrismaSeniority | null = null;
    let mostRecentSession: Date | null = null;
    for (const s of question.sessions) {
      if (!mostRecentSession || s.startedAt > mostRecentSession) {
        mostRecentSession = s.startedAt;
        inheritedSeniority = s.seniority ?? null;
      }
      const snap = await this.snapshotsService.latest(s.id);
      if (!snap) continue;
      const planMd = (snap.artifacts as { planMd?: string | null } | null)?.planMd ?? null;
      if (planMd && (!mostRecent || snap.takenAt > mostRecent)) {
        inheritedPlanMd = planMd;
        mostRecent = snap.takenAt;
      }
    }

    const seniority = seniorityOverride ?? inheritedSeniority;

    const session = await this.sessionsRepository.create({
      questionId,
      seniority,
    });

    if (inheritedPlanMd && inheritedPlanMd.trim().length > 0) {
      await this.snapshotsService.capture(session.id, {
        elapsedMinutes: 0,
        artifacts: { planMd: inheritedPlanMd },
      });
    }

    this.logger.log(
      `Started attempt ${session.id} for question ${questionId} ` +
        `(inherited ${inheritedPlanMd?.length ?? 0} chars of plan.md, seniority=${seniority ?? 'null'})`,
    );
    return session;
  }

  // Hard delete with cascade through every attempt.
  //
  // The question row's FK to sessions is onDelete: Restrict — a single
  // prisma.question.delete would throw if any session existed. The repo
  // method does a transactional deleteMany on sessions (cascades through
  // snapshots, hints, build_events, build_ai_interactions, phase_evals
  // and their downstream artifacts) followed by deleting the question.
  //
  // Per-session disk artifacts are scheduled for async cleanup so the
  // API response stays snappy regardless of how many attempts the
  // question accumulated.
  async deleteQuestion(
    questionId: string,
  ): Promise<{ ok: true; deletedSessions: number }> {
    const question = await this.questionsRepository.findById(questionId);
    if (!question) throw new NotFoundException(`Question ${questionId} not found`);
    const deletedIds = await this.questionsRepository.deleteByIdCascading(questionId);
    this.logger.log(
      `Question ${questionId} deleted (${deletedIds.length} attempt(s) cascaded). ` +
        'Scheduling per-session disk cleanup.',
    );
    for (const sid of deletedIds) {
      void this.sessionsService.cleanupArtifacts(sid);
    }
    return { ok: true, deletedSessions: deletedIds.length };
  }
}
