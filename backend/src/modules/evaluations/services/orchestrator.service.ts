import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhaseEvaluation } from '@prisma/client';
import { Phase } from '../../phase-tagger/models/phase.types';
import { SessionsService } from '../../sessions/services/sessions.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { AIInteractionsRepository } from '../../hints/repositories/ai-interactions.repository';
import { PlanAgent } from './agents/plan.agent';
import { PhaseEvalInput } from './agents/base-phase.agent';
import { EvaluationsRepository } from '../repositories/evaluations.repository';

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
    private readonly snapshotsService: SnapshotsService,
    private readonly aiInteractionsRepo: AIInteractionsRepository,
    private readonly planAgent: PlanAgent,
    private readonly evalsRepo: EvaluationsRepository,
    private readonly config: ConfigService,
  ) {}

  async run(sessionId: string, phases: Phase[] = ['plan']): Promise<PhaseEvaluation[]> {
    const session = await this.sessionsService.get(sessionId);
    const allSnapshots = await this.snapshotsService.list(sessionId);
    const latestSnapshot = await this.snapshotsService.latest(sessionId);
    const hints = await this.aiInteractionsRepo.findBySession(sessionId);

    const rubricVersion = this.config.get<string>('RUBRIC_VERSION') ?? 'v1.0';

    const planMd =
      (latestSnapshot?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

    const input: PhaseEvalInput = {
      session: {
        id: session.id,
        prompt: session.prompt,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
      },
      planMd,
      snapshots: allSnapshots.map((s) => ({
        takenAt: s.takenAt,
        elapsedMinutes: s.elapsedMinutes,
        planMdSize:
          ((s.artifacts as { planMd?: string | null } | null)?.planMd ?? '').length,
      })),
      hints: hints.map((h) => ({
        occurredAt: h.occurredAt,
        elapsedMinutes: h.elapsedMinutes,
        prompt: h.prompt,
        response: h.response,
      })),
      rubricVersion,
    };

    const out: PhaseEvaluation[] = [];
    for (const phase of phases) {
      if (phase !== 'plan') {
        throw new Error(`${phase} agent not implemented in this iteration`);
      }
      this.logger.log(`Running ${phase} agent for session ${sessionId}`);
      const result = await this.planAgent.evaluate(input);
      const persisted = await this.evalsRepo.upsertPhaseEvaluation(sessionId, phase, result);
      out.push(persisted);
    }
    return out;
  }
}
