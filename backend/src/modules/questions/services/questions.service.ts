import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Question, Session } from '@prisma/client';
import { QuestionsRepository } from '../repositories/questions.repository';
import { SessionsRepository } from '../../sessions/repositories/sessions.repository';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { CreateQuestionDto } from '../models/create-question.dto';
import { classifyMode } from '../../evaluations/services/agents/mode-classifier';
import { Seniority as PrismaSeniority } from '@prisma/client';

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private readonly questionsRepository: QuestionsRepository,
    private readonly sessionsRepository: SessionsRepository,
    private readonly snapshotsService: SnapshotsService,
    private readonly config: ConfigService,
  ) {}

  // Create a new Question and its first Session in one shot. The caller (UI)
  // navigates to the new session's editor.
  //
  // Rubric variant routing: v2.0+ rubrics are split into build/design
  // variants. If the client passed an explicit `mode`, honor it; else
  // auto-detect from the prompt via the keyword classifier. v1.0 questions
  // ignore the field entirely (mode = null in the DB).
  async create(dto: CreateQuestionDto): Promise<{ question: Question; session: Session }> {
    const rubricVersion = this.config.get<string>('RUBRIC_VERSION') ?? 'v1.0';
    const mode = rubricVersion === 'v1.0'
      ? null
      : (dto.mode ?? classifyMode(dto.prompt));
    // Seniority is per-attempt, stored on Session. v2.0+ defaults to
    // 'senior'; v1.0 stays null (legacy single-rubric path).
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

  // Start a fresh attempt at this question. The new Session inherits the
  // plan.md content from the question's most-recently-saved attempt
  // (across ALL prior sessions, not just the latest one) so the user picks
  // up where their best work left off.
  // `seniorityOverride` lets the caller pick a different seniority
  // for this retry. When undefined, inherit from the most recent
  // sibling Session — same convention as inheriting plan.md.
  async startAttempt(questionId: string, seniorityOverride?: PrismaSeniority): Promise<Session> {
    const question = await this.get(questionId);

    // Find the most recent snapshot across all sessions of this question.
    let inheritedPlanMd: string | null = null;
    let mostRecent: Date | null = null;
    let inheritedSeniority: PrismaSeniority | null = null;
    let mostRecentSession: Date | null = null;
    for (const s of question.sessions) {
      // Track most recent session for seniority inheritance.
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
}
