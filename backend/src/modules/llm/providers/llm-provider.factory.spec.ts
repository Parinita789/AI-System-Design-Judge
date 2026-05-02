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

  it('returns Anthropic when ANTHROPIC_API_KEY is set', () => {
    env.ANTHROPIC_API_KEY = 'sk-test';
    expect(factory.get()).toBe(anthropic);
  });

  it('falls back to Ollama when no API key and no LLM_PROVIDER override', () => {
    expect(factory.get()).toBe(ollama);
  });

  it('returns Claude CLI when LLM_PROVIDER=claude_cli, even if ANTHROPIC_API_KEY is set', () => {
    env.LLM_PROVIDER = 'claude_cli';
    env.ANTHROPIC_API_KEY = 'sk-test';
    expect(factory.get()).toBe(claudeCli);
  });

  it('ignores LLM_PROVIDER values other than claude_cli', () => {
    env.LLM_PROVIDER = 'something_else';
    env.ANTHROPIC_API_KEY = 'sk-test';
    expect(factory.get()).toBe(anthropic);
  });
});
