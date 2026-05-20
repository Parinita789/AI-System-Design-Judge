import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { HintsService } from './hints.service';
import { ChatRole } from '../../llm/constants';
import { AGENTS_CONFIG } from '../../../config/llm-tunables.config';

const UID = 'uid-1';

describe('HintsService', () => {
  let service: HintsService;

  const sessionsService = { get: jest.fn(), getWithQuestion: jest.fn() };
  const snapshotsService = { latest: jest.fn() };
  const llmService = { call: jest.fn() };
  const aiInteractionsRepo = {
    findBySession: jest.fn(),
    create: jest.fn(),
  };

  // OwnershipService is mocked at the service-level since its real
  // implementation does Prisma lookups. assertOwnsSession resolves
  // by default (= owned); tests override per case for not-found / 403.
  const ownership = {
    assertOwnsSession: jest.fn().mockResolvedValue(undefined),
    assertOwnsQuestion: jest.fn().mockResolvedValue(undefined),
    assertOwnsEvaluation: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ownership.assertOwnsSession.mockResolvedValue(undefined);
    ownership.assertOwnsQuestion.mockResolvedValue(undefined);
    ownership.assertOwnsEvaluation.mockResolvedValue(undefined);
    service = new HintsService(
      sessionsService as never,
      snapshotsService as never,
      llmService as never,
      aiInteractionsRepo as never,
      ownership as never,
    );
  });

  describe('send', () => {
    const session = {
      id: 'sid-1',
      userId: UID,
      question: { id: 'qid-1', prompt: 'Design a URL shortener' },
      startedAt: new Date(Date.now() - 7 * 60_000).toISOString(), // 7 min ago
    };
    const llmReply = {
      text: 'What constraint drives caching?',
      modelUsed: 'claude-opus-4-7',
      tokensIn: 200,
      tokensOut: 30,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    };

    it('reads the session via SessionReadService without consulting OwnershipService', async () => {
      sessionsService.getWithQuestion.mockResolvedValue(session);
      snapshotsService.latest.mockResolvedValue(null);
      aiInteractionsRepo.findBySession.mockResolvedValue([]);
      llmService.call.mockResolvedValue(llmReply);
      aiInteractionsRepo.create.mockResolvedValue({});

      await service.send('sid-1', 'Hi', UID);

      expect(sessionsService.getWithQuestion).toHaveBeenCalledWith('sid-1');
      expect(ownership.assertOwnsSession).not.toHaveBeenCalled();
    });

    it('builds a chat-history messages array, then appends the new user message with plan.md context', async () => {
      sessionsService.getWithQuestion.mockResolvedValue(session);
      snapshotsService.latest.mockResolvedValue({
        artifacts: { planMd: '# Plan\n- scope' },
      });
      aiInteractionsRepo.findBySession.mockResolvedValue([
        { prompt: 'Q1', response: 'R1' },
        { prompt: 'Q2', response: 'R2' },
      ]);
      llmService.call.mockResolvedValue(llmReply);
      aiInteractionsRepo.create.mockResolvedValue({ id: 'ai-new' });

      await service.send('sid-1', 'What about caching?', UID);

      const messages = llmService.call.mock.calls[0][0];
      expect(messages).toHaveLength(5);
      expect(messages[0]).toEqual({ role: ChatRole.User, content: 'Q1' });
      expect(messages[1]).toEqual({ role: ChatRole.Assistant, content: 'R1' });
      expect(messages[2]).toEqual({ role: ChatRole.User, content: 'Q2' });
      expect(messages[3]).toEqual({ role: ChatRole.Assistant, content: 'R2' });
      expect(messages[4].role).toBe(ChatRole.User);
      expect(messages[4].content).toContain('# Plan\n- scope');
      expect(messages[4].content).toContain('What about caching?');
    });

    it('marks the system blocks as cacheable and includes the session question', async () => {
      sessionsService.getWithQuestion.mockResolvedValue(session);
      snapshotsService.latest.mockResolvedValue(null);
      aiInteractionsRepo.findBySession.mockResolvedValue([]);
      llmService.call.mockResolvedValue(llmReply);
      aiInteractionsRepo.create.mockResolvedValue({});

      await service.send('sid-1', 'Hi', UID);

      const opts = llmService.call.mock.calls[0][1];
      expect(opts.maxTokens).toBe(AGENTS_CONFIG.hints.maxTokens);
      expect(Array.isArray(opts.system)).toBe(true);
      expect(opts.system[0].cacheable).toBe(true);
      expect(opts.system[1].text).toContain('Design a URL shortener');
      expect(opts.system[1].cacheable).toBe(true);
    });

    it('uses a "[plan.md is empty]" preamble when no snapshot exists', async () => {
      sessionsService.getWithQuestion.mockResolvedValue(session);
      snapshotsService.latest.mockResolvedValue(null);
      aiInteractionsRepo.findBySession.mockResolvedValue([]);
      llmService.call.mockResolvedValue(llmReply);
      aiInteractionsRepo.create.mockResolvedValue({});

      await service.send('sid-1', 'Where do I start?', UID);

      const lastMsg = llmService.call.mock.calls[0][0].at(-1);
      expect(lastMsg.content).toContain('[plan.md is empty]');
      expect(lastMsg.content).toContain('Where do I start?');
    });

    it('persists an AIInteraction row capturing prompt, response, tokens, and plan state', async () => {
      sessionsService.getWithQuestion.mockResolvedValue(session);
      snapshotsService.latest.mockResolvedValue({ artifacts: { planMd: '# Plan' } });
      aiInteractionsRepo.findBySession.mockResolvedValue([]);
      llmService.call.mockResolvedValue(llmReply);
      aiInteractionsRepo.create.mockResolvedValue({ id: 'ai-new' });

      const result = await service.send('sid-1', 'caching?', UID);

      expect(aiInteractionsRepo.create).toHaveBeenCalledTimes(1);
      const persisted = aiInteractionsRepo.create.mock.calls[0][0];
      expect(persisted.sessionId).toBe('sid-1');
      expect(persisted.prompt).toBe('caching?');
      expect(persisted.response).toBe(llmReply.text);
      expect(persisted.modelUsed).toBe('claude-opus-4-7');
      expect(persisted.tokensIn).toBe(200);
      expect(persisted.tokensOut).toBe(30);
      expect(persisted.artifactStateAtPrompt).toEqual({ planMd: '# Plan' });
      expect(persisted.elapsedMinutes).toBeGreaterThanOrEqual(6);      expect(persisted.elapsedMinutes).toBeLessThanOrEqual(8);
      expect(persisted.inferredPhase).toBeNull();
      expect(result).toEqual({ id: 'ai-new' });
    });

    it('propagates session-not-found from SessionsService', async () => {
      sessionsService.getWithQuestion.mockRejectedValue(new Error('Session missing not found'));
      await expect(service.send('missing', 'hi', UID)).rejects.toThrow(/not found/);
      expect(llmService.call).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the session belongs to another user', async () => {
      sessionsService.getWithQuestion.mockResolvedValue({ ...session, userId: 'uid-other' });
      await expect(service.send('sid-1', 'hi', UID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(ownership.assertOwnsSession).not.toHaveBeenCalled();
      expect(llmService.call).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('asserts ownership then delegates to the repo', async () => {
      aiInteractionsRepo.findBySession.mockResolvedValue([{ id: 'ai-1' }]);
      expect(await service.list('sid-1', UID)).toEqual([{ id: 'ai-1' }]);
      expect(ownership.assertOwnsSession).toHaveBeenCalledWith('sid-1', UID);
      expect(aiInteractionsRepo.findBySession).toHaveBeenCalledWith('sid-1');
    });

    it('propagates NotFoundException from the ownership check', async () => {
      ownership.assertOwnsSession.mockRejectedValue(new NotFoundException('missing'));
      await expect(service.list('missing', UID)).rejects.toBeInstanceOf(NotFoundException);
      expect(aiInteractionsRepo.findBySession).not.toHaveBeenCalled();
    });

    it('propagates ForbiddenException from the ownership check', async () => {
      ownership.assertOwnsSession.mockRejectedValue(new ForbiddenException('not yours'));
      await expect(service.list('sid-1', UID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(aiInteractionsRepo.findBySession).not.toHaveBeenCalled();
    });
  });
});
