import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EvaluationsRepository } from '../../evaluations/repositories/evaluations.repository';
import { SessionsService } from '../../sessions/services/sessions.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { SignalResult } from '../../evaluations/types/evaluation.types';
import { MentorAgent } from '../agents/mentor.agent';
import { MentorRepository } from '../repositories/mentor.repository';
import { MentorInput, MentorResult } from '../types/mentor.types';

@Injectable()
export class MentorService {
  private readonly logger = new Logger(MentorService.name);

  constructor(
    private readonly mentorAgent: MentorAgent,
    private readonly mentorRepo: MentorRepository,
    private readonly evalRepo: EvaluationsRepository,
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
    private readonly snapshotsService: SnapshotsService,
    private readonly config: ConfigService,
  ) {}

  // Public entry: generate or regenerate, persist to DB + disk. Wraps
  // the LLM call in try/catch — network failures, rate limits, and
  // occasional API errors are normal and should not propagate.
  // Returns the persisted row's API shape on success, null on failure.
  async generate(evaluationId: string, model?: string) {
    const evalRow = await this.evalRepo.findById(evaluationId);
    if (!evalRow) {
      throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    }

    const session = await this.sessionsService.getWithQuestion(evalRow.sessionId);
    const latestSnap = await this.snapshotsService.latest(evalRow.sessionId);
    const planMd =
      (latestSnap?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

    const input: MentorInput = {
      question: session.question.prompt,
      planMd,
      signalResults: evalRow.signalResults as unknown as Record<string, SignalResult>,
      feedbackText: evalRow.feedbackText,
      topActionableItems: (evalRow.topActionableItems as unknown as string[]) ?? [],
      score: Number(evalRow.score),
      seniority: session.seniority ?? null,
      sessionId: evalRow.sessionId,
      evaluationId,
      ...(model ? { model } : {}),
    };

    let result: MentorResult;
    try {
      result = await this.mentorAgent.generate(input);
    } catch (err) {
      // Network errors, rate limits, malformed JSON-prose, anything
      // the LLM stack throws — log and bail. The caller (orchestrator
      // for inline generation, controller for explicit re-run) decides
      // how to surface this; for inline use, the eval row stays valid
      // and the missing mentor artifact is the only signal of failure.
      const message = (err as Error).message ?? String(err);
      this.logger.warn(
        `Mentor generation failed for evaluation ${evaluationId}: ${message}`,
      );
      return null;
    }

    // Persist to DB.
    const row = await this.mentorRepo.upsertByEvaluationId(evaluationId, result);

    // Persist prompt + response to disk so we can review what the LLM
    // saw and what it said offline. Best-effort — disk failures
    // shouldn't roll back the DB row.
    await this.writeToDisk(evalRow.sessionId, evaluationId, result).catch((err) => {
      this.logger.warn(
        `Mentor disk write failed for evaluation ${evaluationId}: ${(err as Error).message}`,
      );
    });

    return MentorRepository.toApiShape(row);
  }

  async getByEvaluation(evaluationId: string) {
    const row = await this.mentorRepo.findByEvaluationId(evaluationId);
    if (!row) {
      throw new NotFoundException(
        `No mentor artifact for evaluation ${evaluationId} — generate one first.`,
      );
    }
    return MentorRepository.toApiShape(row);
  }

  // Per-session directory under MENTOR_ARTIFACT_DIR (default
  // ./data/mentor-artifacts). Writes two files per call: the rendered
  // prompt and the raw response, both stamped with the evaluation id
  // and a timestamp so re-runs don't overwrite.
  private async writeToDisk(
    sessionId: string,
    evaluationId: string,
    result: MentorResult,
  ): Promise<void> {
    const baseDir =
      this.config.get<string>('MENTOR_ARTIFACT_DIR') ?? './data/mentor-artifacts';
    const sessionDir = path.resolve(baseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const promptPath = path.join(sessionDir, `${evaluationId}.${stamp}.prompt.txt`);
    const responsePath = path.join(sessionDir, `${evaluationId}.${stamp}.response.md`);

    await Promise.all([
      fs.writeFile(promptPath, result.renderedPrompt, 'utf-8'),
      fs.writeFile(responsePath, result.artifact.content, 'utf-8'),
    ]);

    this.logger.log(
      `Mentor artifact persisted to disk: ${promptPath} + ${responsePath}`,
    );
  }
}
