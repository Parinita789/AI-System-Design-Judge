import { Inject, Injectable, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { EvaluationsRepository } from '../../evaluations/repositories/evaluations.repository';
import { RubricLoaderService } from '../../evaluations/services/rubric-loader.service';
import { gapSignalIds } from '../../evaluations/helpers/gap-signals';
import { SessionsService } from '../../sessions/services/sessions.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { SignalResult } from '../../evaluations/types/evaluation.types';
import { SignalMentorAgent } from '../agents/signal-mentor.agent';
import { SignalMentorRepository } from '../repositories/signal-mentor.repository';
import {
  GapSignalContext,
  SignalMentorInput,
  SignalMentorResult,
} from '../types/signal-mentor.types';

@Injectable()
export class SignalMentorService {
  private readonly logger = new Logger(SignalMentorService.name);

  constructor(
    private readonly agent: SignalMentorAgent,
    private readonly repo: SignalMentorRepository,
    private readonly evalRepo: EvaluationsRepository,
    private readonly rubricLoader: RubricLoaderService,
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
    private readonly snapshotsService: SnapshotsService,
    private readonly config: ConfigService,
  ) {}

  async generate(evaluationId: string, model?: string) {
    const evalRow = await this.evalRepo.findById(evaluationId);
    if (!evalRow) {
      throw new NotFoundException(`Evaluation ${evaluationId} not found`);
    }

    const session = await this.sessionsService.getWithQuestion(evalRow.sessionId);
    const latestSnap = await this.snapshotsService.latest(evalRow.sessionId);
    const planMd =
      (latestSnap?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

    const rubric = await this.rubricLoader.load(
      session.question.rubricVersion,
      'plan',
      session.question.mode ?? undefined,
      session.seniority ?? undefined,
    );
    const signalResults = evalRow.signalResults as unknown as Record<string, SignalResult>;

    const ids = gapSignalIds(rubric, signalResults);

    // No gaps → persist an empty annotations row so the frontend stops
    // polling and renders nothing extra. No LLM call.
    if (ids.length === 0) {
      this.logger.log(
        `Signal-mentor for eval ${evaluationId}: no gap signals — persisting empty row.`,
      );
      const row = await this.repo.upsertByEvaluationId(evaluationId, {
        artifact: { annotations: {} },
        renderedPrompt: '',
        audit: {
          modelUsed: 'noop',
          tokensIn: 0,
          tokensOut: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
          latencyMs: 0,
        },
      });
      return SignalMentorRepository.toApiShape(row);
    }

    const signalById = new Map(rubric.signals.map((s) => [s.id, s]));
    const gaps: GapSignalContext[] = ids
      .map((id) => {
        const signal = signalById.get(id);
        const result = signalResults[id];
        if (!signal || !result) return null;
        return { signal, result };
      })
      .filter((g): g is GapSignalContext => g !== null);

    const input: SignalMentorInput = {
      question: session.question.prompt,
      planMd,
      gaps,
      feedbackText: evalRow.feedbackText,
      score: Number(evalRow.score),
      seniority: session.seniority ?? null,
      sessionId: evalRow.sessionId,
      evaluationId,
      ...(model ? { model } : {}),
    };

    let result: SignalMentorResult;
    try {
      result = await this.agent.generate(input);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      this.logger.warn(
        `Signal-mentor generation failed for evaluation ${evaluationId}: ${message}`,
      );
      return null;
    }

    const row = await this.repo.upsertByEvaluationId(evaluationId, result);

    await this.writeToDisk(evalRow.sessionId, evaluationId, result).catch((err) => {
      this.logger.warn(
        `Signal-mentor disk write failed for evaluation ${evaluationId}: ${(err as Error).message}`,
      );
    });

    return SignalMentorRepository.toApiShape(row);
  }

  async getByEvaluation(evaluationId: string) {
    const row = await this.repo.findByEvaluationId(evaluationId);
    if (!row) {
      throw new NotFoundException(
        `No signal-mentor artifact for evaluation ${evaluationId} — generate one first.`,
      );
    }
    return SignalMentorRepository.toApiShape(row);
  }

  private async writeToDisk(
    sessionId: string,
    evaluationId: string,
    result: SignalMentorResult,
  ): Promise<void> {
    const baseDir =
      this.config.get<string>('SIGNAL_MENTOR_ARTIFACT_DIR') ??
      './data/signal-mentor-artifacts';
    const sessionDir = path.resolve(baseDir, sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const promptPath = path.join(sessionDir, `${evaluationId}.${stamp}.prompt.txt`);
    const responsePath = path.join(sessionDir, `${evaluationId}.${stamp}.response.json`);

    await Promise.all([
      fs.writeFile(promptPath, result.renderedPrompt, 'utf-8'),
      fs.writeFile(responsePath, JSON.stringify(result.artifact.annotations, null, 2), 'utf-8'),
    ]);

    this.logger.log(
      `Signal-mentor persisted to disk: ${promptPath} + ${responsePath}`,
    );
  }
}
