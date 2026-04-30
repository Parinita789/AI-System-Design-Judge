import { LlmProviderFactory } from './llm-provider.factory';

describe('LlmProviderFactory', () => {
  const anthropic = { name: 'anthropic', call: jest.fn() };
  const ollama = { name: 'ollama', call: jest.fn() };
  const claudeCli = { name: 'claude_cli', call: jest.fn() };

  const env: Record<string, string | undefined> = {};
  const config = { get: jest.fn((key: string) => env[key]) };

  let factory: LlmProviderFactory;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(env)) delete env[k];
    factory = new LlmProviderFactory(
      anthropic as never,
      ollama as never,
      claudeCli as never,
      config as never,
    );
  });

  it('returns Anthropic by default (no overrides set)', () => {
    expect(factory.get()).toBe(anthropic);
  });

  it('returns Ollama when OLLAMA_BASE_URL is set', () => {
    env.OLLAMA_BASE_URL = 'http://host:11434';
    expect(factory.get()).toBe(ollama);
  });

  it('returns Claude CLI when LLM_PROVIDER=claude_cli, even if OLLAMA_BASE_URL is set', () => {
    env.LLM_PROVIDER = 'claude_cli';
    env.OLLAMA_BASE_URL = 'http://host:11434';
    expect(factory.get()).toBe(claudeCli);
  });

  it('ignores LLM_PROVIDER values other than claude_cli', () => {
    env.LLM_PROVIDER = 'something_else';
    expect(factory.get()).toBe(anthropic);
  });
});
