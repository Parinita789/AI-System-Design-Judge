import { AnthropicProvider } from './anthropic.provider';
import { ChatRole } from '../constants';

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  const client = { createMessage: jest.fn() };
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    env.LLM_MODEL = 'claude-opus-4-7';
    env.LLM_MAX_TOKENS = '4096';
    provider = new AnthropicProvider(client as never, config as never);
  });

  it('throws if LLM_MODEL env is missing and no override is passed', async () => {
    delete env.LLM_MODEL;
    await expect(
      provider.call([{ role: ChatRole.User, content: 'hi' }], {}),
    ).rejects.toThrow(/LLM_MODEL is not set/);
  });

  it('marks only the last cacheable system block with cache_control', async () => {
    client.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'r' }],
      model: 'claude-opus-4-7',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], {
      system: [
        { text: 'A', cacheable: true },
        { text: 'B', cacheable: true },
        { text: 'C', cacheable: false },
      ],
    });

    const call = client.createMessage.mock.calls[0][0];
    expect(call.system).toEqual([
      { type: 'text', text: 'A' },
      { type: 'text', text: 'B', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: 'C' },
    ]);
  });

  it('passes a string system through unchanged', async () => {
    client.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'r' }],
      model: 'claude-opus-4-7',
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], { system: 'plain prompt' });

    expect(client.createMessage.mock.calls[0][0].system).toBe('plain prompt');
  });

  it('extracts text from text blocks and reports usage including cache tokens', async () => {
    client.createMessage.mockResolvedValue({
      content: [
        { type: 'text', text: 'first' },
        { type: 'tool_use', name: 'noop', input: {} },
        { type: 'text', text: 'second' },
      ],
      model: 'claude-opus-4-7',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        cache_creation_input_tokens: 30,
        cache_read_input_tokens: 70,
      },
    });

    const result = await provider.call([{ role: ChatRole.User, content: 'hi' }], {});

    expect(result).toEqual({
      text: 'first\nsecond',
      modelUsed: 'claude-opus-4-7',
      tokensIn: 100,
      tokensOut: 20,
      cacheCreationTokens: 30,
      cacheReadTokens: 70,
    });
  });

  it('defaults cache token fields to 0 when the API omits them', async () => {
    client.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: 'r' }],
      model: 'claude-opus-4-7',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await provider.call([{ role: ChatRole.User, content: 'hi' }], {});

    expect(result.cacheCreationTokens).toBe(0);
    expect(result.cacheReadTokens).toBe(0);
  });

  it('respects maxTokens override over the env value', async () => {
    client.createMessage.mockResolvedValue({
      content: [{ type: 'text', text: '' }],
      model: 'claude-opus-4-7',
      usage: { input_tokens: 0, output_tokens: 0 },
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], { maxTokens: 256 });

    expect(client.createMessage.mock.calls[0][0].max_tokens).toBe(256);
  });
});
