import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SessionsService } from '../../sessions/services/sessions.service';
import { SnapshotsService } from '../../snapshots/services/snapshots.service';
import { LlmService } from '../../llm/services/llm.service';
import { ChatMessage } from '../../llm/types/llm.types';
import { ChatRole } from '../../llm/constants';
import { AIInteractionsRepository } from '../repositories/ai-interactions.repository';
import { HINT_REPLY_MAX_TOKENS } from '../constants';
import { HINT_SYSTEM_PROMPT } from '../prompts/hint-system-prompt';

@Injectable()
export class HintsService {
  constructor(
    @Inject(forwardRef(() => SessionsService))
    private readonly sessionsService: SessionsService,
    private readonly snapshotsService: SnapshotsService,
    private readonly llmService: LlmService,
    private readonly aiInteractionsRepo: AIInteractionsRepository,
  ) {}

  async send(sessionId: string, message: string) {
    const session = await this.sessionsService.getWithQuestion(sessionId); // throws 404 if missing
    const latestSnapshot = await this.snapshotsService.latest(sessionId);
    const planMd = (latestSnapshot?.artifacts as { planMd?: string | null } | null)?.planMd ?? null;

    // Build messages array from prior turns + new message.
    const history = await this.aiInteractionsRepo.findBySession(sessionId);
    const messages: ChatMessage[] = [];
    for (const turn of history) {
      messages.push({ role: ChatRole.User, content: turn.prompt });
      messages.push({ role: ChatRole.Assistant, content: turn.response });
    }

    // Inject current plan.md into the latest user message so the bot grounds
    // hints in what's actually written. Past turns reference past plan state;
    // that's expected — the rubric cares about iteration.
    const latestUserContent = planMd
      ? `[Current plan.md]\n${planMd}\n\n[Question]\n${message}`
      : `[plan.md is empty]\n\n[Question]\n${message}`;
    messages.push({ role: ChatRole.User, content: latestUserContent });

    const llmResponse = await this.llmService.call(messages, {
      system: [
        { text: HINT_SYSTEM_PROMPT, cacheable: true },
        { text: `## Session question\n${session.question.prompt}`, cacheable: true },
      ],
      maxTokens: HINT_REPLY_MAX_TOKENS,
    });

    const elapsedMinutes = Math.floor(
      (Date.now() - new Date(session.startedAt).getTime()) / 60000,
    );

    return this.aiInteractionsRepo.create({
      sessionId,
      occurredAt: new Date(),
      elapsedMinutes,
      inferredPhase: null,
      prompt: message,
      response: llmResponse.text,
      modelUsed: llmResponse.modelUsed,
      tokensIn: llmResponse.tokensIn,
      tokensOut: llmResponse.tokensOut,
      artifactStateAtPrompt: { planMd } as Prisma.InputJsonValue,
    });
  }

  list(sessionId: string) {
    return this.aiInteractionsRepo.findBySession(sessionId);
  }
}
