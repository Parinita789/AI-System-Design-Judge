import { OllamaProvider } from './ollama.provider';
import { ChatRole } from '../constants';

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  const client = { chat: jest.fn() };
  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    env.OLLAMA_BASE_URL = 'http://host:11434';
    env.OLLAMA_MODEL = 'llama3.1';
    provider = new OllamaProvider(client as never, config as never);
  });

  it('prepends a system role message when system is provided', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: 'r' },
      done: true,
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], { system: 'be terse' });

    const arg = client.chat.mock.calls[0][0];
    expect(arg.messages[0]).toEqual({ role: ChatRole.System, content: 'be terse' });
    expect(arg.messages[1]).toEqual({ role: ChatRole.User, content: 'hi' });
  });

  it('flattens an array system into a single concatenated message', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: 'r' },
      done: true,
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], {
      system: [
        { text: 'A', cacheable: true },
        { text: 'B', cacheable: false },
      ],
    });

    expect(client.chat.mock.calls[0][0].messages[0]).toEqual({
      role: ChatRole.System,
      content: 'A\n\nB',
    });
  });

  it('omits the system message when no system is provided', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: 'r' },
      done: true,
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], {});

    const messages = client.chat.mock.calls[0][0].messages;
    expect(
      messages.find((m: { role: ChatRole }) => m.role === ChatRole.System),
    ).toBeUndefined();
  });

  it('forwards maxTokens as Ollama num_predict option', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: '' },
      done: true,
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], { maxTokens: 512 });

    expect(client.chat.mock.calls[0][0].options).toEqual({ num_predict: 512 });
  });

  it('forwards temperature inside the Ollama options map', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: '' },
      done: true,
    });

    await provider.call([{ role: ChatRole.User, content: 'hi' }], {
      maxTokens: 512,
      temperature: 0,
    });

    expect(client.chat.mock.calls[0][0].options).toEqual({ num_predict: 512, temperature: 0 });
  });

  it('maps Ollama eval counts to tokensIn/tokensOut and zeros cache fields', async () => {
    client.chat.mockResolvedValue({
      model: 'llama3.1',
      message: { role: 'assistant', content: 'reply' },
      prompt_eval_count: 50,
      eval_count: 12,
      done: true,
    });

    const result = await provider.call([{ role: ChatRole.User, content: 'hi' }], {});

    expect(result).toEqual({
      text: 'reply',
      modelUsed: 'llama3.1',
      tokensIn: 50,
      tokensOut: 12,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
    });
  });
});
