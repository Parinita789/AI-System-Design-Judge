import { ClaudeCliProvider } from './claude-cli.provider';
import { ChatRole } from '../constants';

describe('ClaudeCliProvider', () => {
  let provider: ClaudeCliProvider;
  const client = { run: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new ClaudeCliProvider(client as never);
  });

  it('returns the CLI text and reports zero token counts', async () => {
    client.run.mockResolvedValue({ text: 'hi from cli', model: 'claude-cli' });

    const result = await provider.call([{ role: ChatRole.User, content: 'hello' }], {});

    expect(client.run).toHaveBeenCalled();
    expect(result.text).toBe('hi from cli');
    expect(result.modelUsed).toBe('claude-cli');
    expect(result.tokensIn).toBe(0);
    expect(result.tokensOut).toBe(0);
  });

  it('flattens system + messages into a single prompt with role labels', async () => {
    client.run.mockResolvedValue({ text: 'r', model: 'claude-cli' });

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
});
