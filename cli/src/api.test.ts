import { describeError, drainBuffer, MentorApiClient, sendWithBackoff } from './api';
import { BufferedEvent } from './buffer';

describe('describeError', () => {
  it('returns the message when present', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });

  it('falls back to err.code when message is empty', () => {
    expect(describeError({ message: '', code: 'ECONNREFUSED' })).toBe('ECONNREFUSED');
  });

  it('falls back to HTTP status when no message + no code', () => {
    expect(
      describeError({ message: '', response: { status: 503, statusText: 'Service Unavailable' } }),
    ).toBe('HTTP 503 Service Unavailable');
  });

  it('reads from err.cause when the outer is empty', () => {
    expect(describeError({ message: '', cause: { code: 'ETIMEDOUT' } })).toBe('ETIMEDOUT');
  });

  it('returns "unknown error" instead of [object Object]', () => {
    expect(describeError({})).toBe('unknown error');
  });

  it('handles null/undefined', () => {
    expect(describeError(null)).toBe('unknown error');
    expect(describeError(undefined)).toBe('unknown error');
  });
});

describe('sendWithBackoff', () => {
  it('succeeds without retry on first attempt', async () => {
    const client = {
      sendEvents: jest.fn().mockResolvedValue({ accepted: 3 }),
    } as unknown as MentorApiClient;
    const out = await sendWithBackoff(client, [], []);
    expect(out).toEqual({ ok: true, accepted: 3 });
    expect(client.sendEvents).toHaveBeenCalledTimes(1);
  });

  it('returns a useful error after exhausting retries', async () => {
    const err = { message: '', code: 'ECONNREFUSED' };
    const client = {
      sendEvents: jest.fn().mockRejectedValue(err),
    } as unknown as MentorApiClient;
    const out = await sendWithBackoff(client, [], [0, 0, 0]);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('ECONNREFUSED');
    expect(client.sendEvents).toHaveBeenCalledTimes(4);
  });
});

describe('drainBuffer', () => {
  function makeEvent(id: number): BufferedEvent {
    return {
      id,
      filePath: `f${id}.ts`,
      action: 'created',
      content: 'x',
      contentDiff: null,
      occurredAt: new Date(0).toISOString(),
      sent: false,
    };
  }

  it('chunks the unsent set into batches and stops when the buffer is empty', async () => {
    const all = [1, 2, 3, 4, 5].map(makeEvent);
    const sent = new Set<number>();
    const buffer = {
      unsent: jest.fn((limit?: number) =>
        all.filter((e) => !sent.has(e.id)).slice(0, limit ?? all.length),
      ),
      markSent: jest.fn((ids: number[]) => ids.forEach((i) => sent.add(i))),
    };
    const client = {
      sendEvents: jest.fn(async (events: BufferedEvent[]) => ({ accepted: events.length })),
    } as unknown as MentorApiClient;

    const out = await drainBuffer(client, buffer, 2);
    expect(out).toEqual({ flushed: 5, remaining: 0 });
    expect(client.sendEvents).toHaveBeenCalledTimes(3);
  });

  it('stops on the first failed batch and reports the unsent remainder', async () => {
    const all = [1, 2, 3, 4, 5].map(makeEvent);
    const sent = new Set<number>();
    const buffer = {
      unsent: jest.fn((limit?: number) =>
        all.filter((e) => !sent.has(e.id)).slice(0, limit ?? all.length),
      ),
      markSent: jest.fn((ids: number[]) => ids.forEach((i) => sent.add(i))),
    };
    const client = {
      sendEvents: jest.fn(async (events: BufferedEvent[]) => {
        if (events.some((e) => e.id === 3 || e.id === 4)) {
          throw { message: '', code: 'ECONNREFUSED' };
        }
        return { accepted: events.length };
      }),
    } as unknown as MentorApiClient;

    const out = await drainBuffer(client, buffer, 2, [0, 0, 0]);
    expect(out.flushed).toBe(2);
    expect(out.remaining).toBe(3);
    expect(out.error).toBe('ECONNREFUSED');
  });
});
