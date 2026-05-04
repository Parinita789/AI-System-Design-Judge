import { ClaudeCliProvider } from './claude-cli.provider';
import { ChatRole } from '../constants';

describe('ClaudeCliProvider', () => {
  let provider: ClaudeCliProvider;
  const client = { run: jest.fn() };

  function cliResult(overrides: Partial<{
    text: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }> = {}) {
    return {
      text: 'r',
      model: 'claude-cli',
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ClaudeCliProvider(client as never);
  });

  it('forwards the CLI result, including token counts, onto the LlmResponse', async () => {
    client.run.mockResolvedValue(
      cliResult({
        text: 'hi from cli',
        model: 'claude-opus-4-7',
        tokensIn: 10,
        tokensOut: 4,
        cacheReadTokens: 8000,
        cacheCreationTokens: 200,
      }),
    );

    const result = await provider.call([{ role: ChatRole.User, content: 'hello' }], {});

    expect(client.run).toHaveBeenCalled();
    expect(result).toMatchObject({
      text: 'hi from cli',
      modelUsed: 'claude-opus-4-7',
      tokensIn: 10,
      tokensOut: 4,
      cacheReadTokens: 8000,
      cacheCreationTokens: 200,
    });
  });

  it('flattens system + messages into a single prompt with role labels', async () => {
    client.run.mockResolvedValue(cliResult());

    await provider.call(
      [
        { role: ChatRole.User, content: 'first question' },
        { role: ChatRole.Assistant, content: 'prior answer' },
        { role: ChatRole.User, content: 'follow-up' },
      ],
      { system: 'be terse' },
    );

    const prompt = client.run.mock.calls[0][0];
    expect(prompt).toContain('be terse');
    expect(prompt).toContain('User: first question');
    expect(prompt).toContain('Assistant: prior answer');
    expect(prompt).toContain('User: follow-up');
  });

  it('forwards opts.model to the CLI client (per-call picker)', async () => {
    client.run.mockResolvedValue(cliResult({ model: 'claude-haiku-4-5' }));

    await provider.call([{ role: ChatRole.User, content: 'hi' }], {
      model: 'claude-haiku-4-5',
    });

    // Second arg of the client.run call carries the model override.
    expect(client.run.mock.calls[0][1]).toBe('claude-haiku-4-5');
  });

  it('passes undefined model when opts.model is absent (CLI uses its default)', async () => {
    client.run.mockResolvedValue(cliResult());
    await provider.call([{ role: ChatRole.User, content: 'hi' }], {});
    expect(client.run.mock.calls[0][1]).toBeUndefined();
  });
});
