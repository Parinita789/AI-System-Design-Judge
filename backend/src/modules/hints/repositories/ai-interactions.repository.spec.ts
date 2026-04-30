import { AIInteractionsRepository } from './ai-interactions.repository';

describe('AIInteractionsRepository', () => {
  let repo: AIInteractionsRepository;
  const aIInteraction = {
    create: jest.fn(),
    findMany: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new AIInteractionsRepository({ aIInteraction } as never);
  });

  describe('findBySession', () => {
    it('queries chronologically (oldest first) so chat history reads in order', async () => {
      aIInteraction.findMany.mockResolvedValue([]);
      await repo.findBySession('sid-1');

      expect(aIInteraction.findMany).toHaveBeenCalledWith({
        where: { sessionId: 'sid-1' },
        orderBy: { occurredAt: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('persists the exchange row as-is', async () => {
      aIInteraction.create.mockResolvedValue({ id: 'ai-1' });
      const data = {
        sessionId: 'sid-1',
        occurredAt: new Date('2026-04-29T22:00:00Z'),
        elapsedMinutes: 7,
        inferredPhase: null,
        prompt: 'What about caching?',
        response: 'What constraint drives the cache?',
        modelUsed: 'claude-opus-4-7',
        tokensIn: 120,
        tokensOut: 40,
        artifactStateAtPrompt: { planMd: '# Plan' },
      };
      const result = await repo.create(data);

      expect(aIInteraction.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual({ id: 'ai-1' });
    });
  });
});
