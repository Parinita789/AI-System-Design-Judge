import { ConfigService } from '@nestjs/config';
import { CostCapService } from './cost-cap.service';
import { CostCapExceededError } from '../errors';
import { LlmProvider } from '../pricing';

function makeService(opts: {
  capUsd?: string;
  todaySpend?: number;
  insertImpl?: jest.Mock;
}): { svc: CostCapService; llmSpend: { insert: jest.Mock; sumSinceTodayUtcMidnight: jest.Mock } } {
  const llmSpend = {
    insert: opts.insertImpl ?? jest.fn().mockResolvedValue({}),
    sumSinceTodayUtcMidnight: jest.fn().mockResolvedValue(opts.todaySpend ?? 0),
  };
  const config = {
    get: jest.fn().mockReturnValue(opts.capUsd ?? '5.00'),
  } as unknown as ConfigService;
  return { svc: new CostCapService(llmSpend as never, config), llmSpend };
}

describe('CostCapService construction', () => {
  it('reads LLM_DAILY_CAP_USD from config', () => {
    const { svc } = makeService({ capUsd: '12.50' });
    expect(svc.getDailyCapUsd()).toBe(12.5);
  });

  it('defaults to $5.00 when env is missing', () => {
    const { svc } = makeService({ capUsd: '' });
    expect(svc.getDailyCapUsd()).toBe(5);
  });

  it('throws on a negative cap', () => {
    expect(() => makeService({ capUsd: '-1.00' })).toThrow(/not a non-negative number/);
  });

  it('throws on a non-numeric cap', () => {
    expect(() => makeService({ capUsd: 'one dollar' })).toThrow(/not a non-negative number/);
  });
});

describe('CostCapService.assertWithinCap', () => {
  it('resolves silently when spend is under the cap', async () => {
    const { svc } = makeService({ capUsd: '5.00', todaySpend: 1.23 });
    await expect(svc.assertWithinCap('uid-1')).resolves.toBeUndefined();
  });

  it('throws CostCapExceededError when spend equals the cap', async () => {
    const { svc } = makeService({ capUsd: '5.00', todaySpend: 5.0 });
    await expect(svc.assertWithinCap('uid-1')).rejects.toBeInstanceOf(CostCapExceededError);
  });

  it('throws when spend exceeds the cap', async () => {
    const { svc } = makeService({ capUsd: '5.00', todaySpend: 6.75 });
    await expect(svc.assertWithinCap('uid-1')).rejects.toBeInstanceOf(CostCapExceededError);
  });

  it('error body carries spentTodayUsd + capUsd + resetAtUtc', async () => {
    const { svc } = makeService({ capUsd: '5.00', todaySpend: 5.5 });
    try {
      await svc.assertWithinCap('uid-1');
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(CostCapExceededError);
      const body = (err as CostCapExceededError).getResponse() as Record<string, unknown>;
      expect(body.code).toBe('COST_CAP_EXCEEDED');
      expect(body.spentTodayUsd).toBe(5.5);
      expect(body.capUsd).toBe(5);
      expect(typeof body.resetAtUtc).toBe('string');
      // ISO 8601 + Z suffix
      expect(body.resetAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
    }
  });

  it('queries the repository for the user-specific sum', async () => {
    const { svc, llmSpend } = makeService({ todaySpend: 0 });
    await svc.assertWithinCap('uid-1');
    expect(llmSpend.sumSinceTodayUtcMidnight).toHaveBeenCalledWith('uid-1');
  });
});

describe('CostCapService.record', () => {
  it('inserts a spend row with the estimated cost for known Anthropic models', async () => {
    const { svc, llmSpend } = makeService({});
    await svc.record({
      userId: 'uid-1',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      tokens: {
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      route: 'POST /sessions/:id/hints',
    });
    expect(llmSpend.insert).toHaveBeenCalledTimes(1);
    const arg = llmSpend.insert.mock.calls[0][0];
    expect(arg.estimatedCostUsd).toBeCloseTo(30, 6); // 1M in × $5 + 1M out × $25
    expect(arg.userId).toBe('uid-1');
    expect(arg.route).toBe('POST /sessions/:id/hints');
  });

  it('records $0 for claude_cli regardless of model', async () => {
    const { svc, llmSpend } = makeService({});
    await svc.record({
      userId: 'uid-1',
      provider: 'claude_cli',
      model: 'claude-opus-4-7',
      tokens: { tokensIn: 1_000_000, tokensOut: 1_000_000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      route: 'POST /mentor/:id',
    });
    expect(llmSpend.insert.mock.calls[0][0].estimatedCostUsd).toBe(0);
  });

  it('propagates pricing errors for unknown Anthropic models', async () => {
    const { svc } = makeService({});
    await expect(
      svc.record({
        userId: 'uid-1',
        provider: 'anthropic',
        model: 'claude-future-99',
        tokens: { tokensIn: 100, tokensOut: 100, cacheReadTokens: 0, cacheCreationTokens: 0 },
        route: 'POST /test',
      }),
    ).rejects.toThrow(/Unknown Anthropic model/);
  });

  it('propagates DB insert failures (no silent swallow)', async () => {
    const insertImpl = jest.fn().mockRejectedValue(new Error('connection reset'));
    const { svc } = makeService({ insertImpl });
    await expect(
      svc.record({
        userId: 'uid-1',
        provider: 'anthropic' as LlmProvider,
        model: 'claude-opus-4-7',
        tokens: { tokensIn: 100, tokensOut: 100, cacheReadTokens: 0, cacheCreationTokens: 0 },
        route: 'POST /test',
      }),
    ).rejects.toThrow(/connection reset/);
  });
});

describe('CostCapService.getTodaySpendUsd', () => {
  it('returns the repository sum verbatim', async () => {
    const { svc } = makeService({ todaySpend: 2.42 });
    await expect(svc.getTodaySpendUsd('uid-1')).resolves.toBe(2.42);
  });
});
